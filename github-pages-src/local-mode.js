(function () {
  'use strict';

  window.PROJECT_TOOLS_STATIC_MODE = true;
  document.documentElement.classList.add('project-tools-static', 'project-tools-locked');

  const ACCOUNT_KEY = 'project-tools-local-account-v1';
  const SESSION_KEY = 'project-tools-local-session-v1';
  const DATABASE_NAME = 'project-tools-local-files-v1';
  const HANDLE_STORE = 'handles';
  const HANDLE_LIBRARY = 'library';
  const HANDLE_BUDGET = 'budget';
  const PAGE_ROOT = new URL('./', location.href);
  const DOCUMENT_ROOT_CANDIDATES = [
    ['Project Tools Content Library', 'Project Tools Library', 'documents'],
    ['Project Tools Library', 'documents'],
    ['documents'],
    [],
  ];
  const BUDGET_ROOT_CANDIDATES = [
    ['Project Tools Content Library', 'Project Tools Library', 'Budget Data', 'Source Price Lists'],
    ['Project Tools Library', 'Budget Data', 'Source Price Lists'],
    ['Budget Data', 'Source Price Lists'],
    ['Source Price Lists'],
    [],
  ];
  let databasePromise;
  let libraryHandle = null;
  let budgetHandle = null;
  let activeLibraryInventory = null;
  let activeBudgetInventory = null;
  const documentInventoryCache = new WeakMap();
  const budgetInventoryCache = new WeakMap();
  let settingsDialog = null;
  let settingsButton = null;
  let libraryStatus = null;
  let budgetStatus = null;
  let libraryConnect = null;
  let budgetConnect = null;

  function openDatabase() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(HANDLE_STORE)) {
          request.result.createObjectStore(HANDLE_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Browser storage could not be opened.'));
    });
    return databasePromise;
  }

  async function handleStore(mode, operation) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(HANDLE_STORE, mode);
      const store = transaction.objectStore(HANDLE_STORE);
      let request;
      try { request = operation(store); } catch (error) { reject(error); return; }
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Browser storage could not be updated.'));
    });
  }

  function getSavedHandle(key) {
    return handleStore('readonly', store => store.get(key));
  }

  function saveHandle(key, value) {
    return handleStore('readwrite', store => store.put(value, key));
  }

  function forgetHandle(key) {
    return handleStore('readwrite', store => store.delete(key));
  }

  function bytesToBase64(bytes) {
    let binary = '';
    for (const value of bytes) binary += String.fromCharCode(value);
    return btoa(binary);
  }

  async function passwordDigest(password, salt) {
    const material = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits'],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 180000 },
      material,
      256,
    );
    return new Uint8Array(bits);
  }

  function readAccount() {
    try {
      const account = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null');
      return account && account.username && account.salt && account.digest ? account : null;
    } catch (_) {
      return null;
    }
  }

  function createGate(account) {
    const gate = document.createElement('section');
    gate.className = 'local-gate';
    gate.setAttribute('aria-label', account ? 'Sign in' : 'Create local sign-in');
    gate.innerHTML = `
      <form class="local-card" id="local-login-form">
        <p class="local-eyebrow">Browser-only project workspace</p>
        <h1>${account ? 'Sign in' : 'Create your local sign-in'}</h1>
        <p class="local-intro">${account
          ? 'Enter the credentials saved in this browser.'
          : 'This lightweight login is saved only in this browser. It is a deterrent, not server-grade access control.'}</p>
        <label>Username<input id="local-username" autocomplete="username" required></label>
        <label>Password<input id="local-password" type="password" autocomplete="${account ? 'current-password' : 'new-password'}" required minlength="8"></label>
        ${account ? '' : '<label>Confirm password<input id="local-password-confirm" type="password" autocomplete="new-password" required minlength="8"></label>'}
        <button class="local-primary" type="submit">${account ? 'Sign in' : 'Create and continue'}</button>
        <p class="local-error" id="local-login-error" role="alert" hidden></p>
        <p class="local-note">Documents and pricing remain on this computer. GitHub hosts only the interface and non-price catalog metadata.</p>
      </form>`;
    document.body.append(gate);
    const form = gate.querySelector('form');
    const username = gate.querySelector('#local-username');
    const password = gate.querySelector('#local-password');
    const confirm = gate.querySelector('#local-password-confirm');
    const error = gate.querySelector('#local-login-error');
    if (account) username.value = account.username;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      error.hidden = true;
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const enteredUsername = username.value.trim();
        if (!enteredUsername) throw new Error('Enter a username.');
        if (password.value.length < 8) throw new Error('Use a password with at least 8 characters.');
        if (account) {
          const salt = Uint8Array.from(atob(account.salt), value => value.charCodeAt(0));
          const digest = bytesToBase64(await passwordDigest(password.value, salt));
          if (enteredUsername !== account.username || digest !== account.digest) {
            throw new Error('The username or password is incorrect.');
          }
        } else {
          if (password.value !== confirm.value) throw new Error('The passwords do not match.');
          const salt = crypto.getRandomValues(new Uint8Array(16));
          const digest = await passwordDigest(password.value, salt);
          localStorage.setItem(ACCOUNT_KEY, JSON.stringify({
            username: enteredUsername,
            salt: bytesToBase64(salt),
            digest: bytesToBase64(digest),
          }));
        }
        sessionStorage.setItem(SESSION_KEY, 'active');
        gate.remove();
        unlockApplication();
      } catch (failure) {
        error.textContent = failure && failure.message ? failure.message : 'Sign-in could not be completed.';
        error.hidden = false;
        button.disabled = false;
      }
    });
    setTimeout(() => (account ? password : username).focus(), 0);
  }

  async function permission(handle, request) {
    if (!handle) return 'missing';
    if (typeof handle.queryPermission !== 'function') return 'granted';
    let state = await handle.queryPermission({ mode: 'read' });
    if (state !== 'granted' && request && typeof handle.requestPermission === 'function') {
      state = await handle.requestPermission({ mode: 'read' });
    }
    return state;
  }

  async function selectionPermission(selection, request) {
    if (Array.isArray(selection)) {
      if (!selection.length) return 'missing';
      const states = await Promise.all(selection.map(handle => permission(handle, request)));
      return states.every(state => state === 'granted') ? 'granted' : 'prompt';
    }
    return permission(selection, request);
  }

  async function requirePermission(handle, label) {
    if (!handle) {
      openSettings();
      throw new Error(`Choose the ${label} location in Local files first.`);
    }
    const state = await permission(handle, true);
    if (state !== 'granted') {
      openSettings();
      throw new Error(`Reconnect the remembered ${label} location before continuing.`);
    }
    return handle;
  }

  async function fileAt(root, parts) {
    const safeParts = parts.filter(Boolean);
    if (!safeParts.length || safeParts.some(part => part === '.' || part === '..')) {
      throw new Error('Unsafe local file path.');
    }
    let directory = root;
    for (let index = 0; index < safeParts.length - 1; index += 1) {
      directory = await directory.getDirectoryHandle(safeParts[index]);
    }
    const handle = await directory.getFileHandle(safeParts[safeParts.length - 1]);
    return handle.getFile();
  }

  function pathParts(value) {
    return String(value || '').split('/').map(part => {
      try { return decodeURIComponent(part); } catch (_) { return part; }
    }).filter(Boolean);
  }

  function budgetSources() {
    try {
      const catalog = JSON.parse(document.getElementById('budget-catalog')?.textContent || '{}');
      return (catalog.priceLists || []).map(list => ({
        id: String(list.id || '').trim(),
        label: String(list.label || '').trim(),
        sourceFile: String(list.sourceFile || '').trim(),
      })).filter(list => list.sourceFile);
    } catch (_) {
      return [];
    }
  }

  function budgetSourceFiles() {
    return [...new Set(budgetSources().map(list => list.sourceFile))];
  }

  async function directoryAt(root, parts) {
    let directory = root;
    for (const part of parts.filter(Boolean)) directory = await directory.getDirectoryHandle(part);
    return directory;
  }

  function inventoryPathKey(value) {
    return String(value || '')
      .replace(/\\/g, '/')
      .replace(/^\.?\/?documents\//i, '')
      .replace(/^\/+|\/+$/g, '')
      .normalize('NFKC')
      .toLocaleLowerCase();
  }

  async function collectDirectoryFiles(directory, parentParts = [], output = [], depth = 0) {
    if (depth > 8) return output;
    for await (const [name, entry] of directory.entries()) {
      if (output.length >= 20000) throw new Error('The selected folder contains too many files to use as a document library.');
      const relativeParts = [...parentParts, name];
      if (entry.kind === 'file') {
        output.push({ name, relativePath: relativeParts.join('/'), handle: entry });
      } else if (entry.kind === 'directory') {
        await collectDirectoryFiles(entry, relativeParts, output, depth + 1);
      }
    }
    return output;
  }

  async function locateDocumentInventory(root, force = false) {
    if (!force && documentInventoryCache.has(root)) return documentInventoryCache.get(root);
    for (const prefix of DOCUMENT_ROOT_CANDIDATES) {
      try {
        const directory = await directoryAt(root, prefix);
        const files = await collectDirectoryFiles(directory);
        if (!files.length) continue;
        const byPath = new Map();
        const byName = new Map();
        for (const item of files) {
          byPath.set(inventoryPathKey(item.relativePath), item);
          const nameKey = String(item.name || '').normalize('NFKC').toLocaleLowerCase();
          if (nameKey && !byName.has(nameKey)) byName.set(nameKey, item);
        }
        const inventory = { directory, prefix, files, byPath, byName };
        documentInventoryCache.set(root, inventory);
        return inventory;
      } catch (error) {
        if (error && /too many files/i.test(error.message || '')) throw error;
      }
    }
    throw new Error('No files were found in the selected document library.');
  }

  function publishLibraryInventory(inventory) {
    if (activeLibraryInventory === (inventory || null)) return;
    activeLibraryInventory = inventory || null;
    const api = window.ProjectToolsDocumentLibrary;
    if (!api) return;
    if (!inventory) {
      api.clearInventory();
      return;
    }
    api.setInventory(inventory.files.map(item => ({
      name: item.name,
      relativePath: item.relativePath,
    })));
  }

  function hasDocument(relativePath, filename) {
    if (!activeLibraryInventory) return false;
    const parts = pathParts(relativePath);
    const candidateName = filename || parts[parts.length - 1] || '';
    return activeLibraryInventory.byPath.has(inventoryPathKey(relativePath)) ||
      activeLibraryInventory.byName.has(String(candidateName).normalize('NFKC').toLocaleLowerCase());
  }

  function isLibraryReady() {
    return Boolean(activeLibraryInventory && activeLibraryInventory.files.length);
  }

  async function findDocumentFile(root, relativePath) {
    const inventory = await locateDocumentInventory(root);
    const parts = pathParts(relativePath);
    const filename = parts[parts.length - 1];
    const item = inventory.byPath.get(inventoryPathKey(relativePath)) ||
      inventory.byName.get(String(filename || '').normalize('NFKC').toLocaleLowerCase());
    if (!item) throw new Error(`“${filename || 'Document'}” was not found in this folder.`);
    return item.handle.getFile();
  }

  function budgetFileKey(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\.[^.]+$/, '')
      .replace(/^\s*\d+[\s._-]*/, '')
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  function supportedBudgetFile(name) {
    return /\.(xlsx|xlsm)$/i.test(String(name || ''));
  }

  function buildBudgetInventory(files, directory = null, prefix = []) {
    const byExactName = new Map();
    const byKey = new Map();
    for (const item of files) {
      const exactName = String(item.name || '').normalize('NFKC').toLocaleLowerCase();
      if (exactName && !byExactName.has(exactName)) byExactName.set(exactName, item);
      const key = budgetFileKey(item.name);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(item);
    }
    return { directory, prefix, files, byExactName, byKey };
  }

  async function locateBudgetInventory(root, force = false) {
    if (!force && budgetInventoryCache.has(root)) return budgetInventoryCache.get(root);
    if (Array.isArray(root)) {
      const files = [];
      for (const handle of root) {
        if (!handle || handle.kind !== 'file' || !supportedBudgetFile(handle.name)) continue;
        files.push({ name: handle.name, relativePath: handle.name, handle });
      }
      if (!files.length) throw new Error('No .xlsx or .xlsm price-list workbooks were selected.');
      const inventory = buildBudgetInventory(files);
      budgetInventoryCache.set(root, inventory);
      return inventory;
    }
    for (const prefix of BUDGET_ROOT_CANDIDATES) {
      try {
        const directory = await directoryAt(root, prefix);
        const files = (await collectDirectoryFiles(directory))
          .filter(item => supportedBudgetFile(item.name));
        if (!files.length) continue;
        const inventory = buildBudgetInventory(files, directory, prefix);
        budgetInventoryCache.set(root, inventory);
        return inventory;
      } catch (error) {
        if (error && /too many files/i.test(error.message || '')) throw error;
      }
    }
    throw new Error('No .xlsx or .xlsm price-list workbooks were found in the selected folder or its subfolders.');
  }

  function selectBudgetInventoryItem(inventory, filename) {
    const exactName = String(filename || '').normalize('NFKC').toLocaleLowerCase();
    const exact = inventory.byExactName.get(exactName);
    if (exact) return exact;
    const matches = inventory.byKey.get(budgetFileKey(filename)) || [];
    if (matches.length === 1) return matches[0];
    if (inventory.files.length === 1) return inventory.files[0];
    return null;
  }

  async function findBudgetFile(root, filename) {
    const inventory = await locateBudgetInventory(root);
    const item = selectBudgetInventoryItem(inventory, filename);
    if (item) return item.handle.getFile();
    const detected = inventory.files.slice(0, 5).map(file => `“${file.name}”`).join(', ');
    throw new Error(`“${filename}” was not matched in the selected folder.${detected ? ` Detected: ${detected}.` : ''}`);
  }

  async function requirePermissionForValidation(handle, label, requestPermission) {
    if (!handle) throw new Error(`Choose the ${label} location.`);
    const state = await permission(handle, requestPermission);
    if (state !== 'granted') throw new Error(`Reconnect the remembered ${label} location.`);
    return handle;
  }

  async function validateLibraryHandle(handle, requestPermission = true, force = false) {
    const root = await requirePermissionForValidation(handle, 'document library', requestPermission);
    try {
      return await locateDocumentInventory(root, force);
    } catch (error) {
      if (error && /too many files/i.test(error.message || '')) throw error;
      throw new Error('No readable files were found. Select the release folder, Project Tools Content Library, Project Tools Library, or its documents folder.');
    }
  }

  async function validateBudgetHandle(handle, requestPermission = true, force = false) {
    if (!handle || (Array.isArray(handle) && !handle.length)) throw new Error('Choose the price-list workbooks.');
    const permissionState = await selectionPermission(handle, requestPermission);
    if (permissionState !== 'granted') throw new Error('Reconnect the remembered price-list workbooks.');
    const root = handle;
    const filenames = budgetSourceFiles();
    if (!filenames.length) throw new Error('The application price-list index is unavailable.');
    try {
      return await locateBudgetInventory(root, force);
    } catch (error) {
      if (error && /too many files/i.test(error.message || '')) throw error;
      if (Array.isArray(root)) throw new Error('No .xlsx or .xlsm price-list workbooks were selected.');
      throw new Error('No .xlsx or .xlsm workbooks were found. Select the folder that contains the price-list workbooks; the Windows folder picker intentionally shows folders only.');
    }
  }

  async function getLibraryFile(relativePath) {
    const root = await requirePermission(libraryHandle, 'document library');
    const parts = pathParts(relativePath);
    const filename = parts[parts.length - 1];
    try {
      return await findDocumentFile(root, relativePath);
    } catch (_) {
      throw new Error(`“${filename || 'Document'}” was not found in the selected library. Open Local files and choose the release folder, Project Tools Content Library, Project Tools Library, or its documents folder.`);
    }
  }

  async function readBudgetWorkbook(filename) {
    const roots = [];
    if (budgetHandle) roots.push({ handle: budgetHandle, label: 'price-list folder' });
    if (libraryHandle && libraryHandle !== budgetHandle) roots.push({ handle: libraryHandle, label: 'document library' });
    if (!roots.length) {
      openSettings();
      throw new Error('Choose the price-list folder in Local files before generating a budget.');
    }
    let firstFailure = null;
    for (const entry of roots) {
      try {
        const permissionState = await selectionPermission(entry.handle, true);
        if (permissionState !== 'granted') throw new Error(`Reconnect the remembered ${entry.label}.`);
        const root = entry.handle;
        return await findBudgetFile(root, filename);
      } catch (error) {
        if (!firstFailure) firstFailure = error;
      }
    }
    openSettings();
    if (firstFailure && firstFailure.message) throw firstFailure;
    throw new Error(`“${filename}” was not found. In Local files, choose the folder containing the .xlsx or .xlsm price-list workbooks.`);
  }

  function download(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 30000);
  }

  async function exportBundle(packageName, files, documents) {
    if (typeof window.JSZip !== 'function') throw new Error('The ZIP export component is not available.');
    const zip = new window.JSZip();
    for (const file of files || []) zip.file(file.name, file.bytes);
    for (const item of documents || []) {
      const file = await getLibraryFile(item.path);
      const documentType = String(item.documentType || 'Other Documents').replace(/[<>:"/\\|?*]/g, '_');
      const targetName = String(item.targetName || file.name).replace(/[<>:"/\\|?*]/g, '_');
      zip.file(`Product Documents/${documentType}/${targetName}`, file);
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 5 } });
    download(blob, `${packageName}.zip`);
  }

  async function openDocument(relativePath) {
    const blank = window.open('about:blank', '_blank');
    try {
      const file = await getLibraryFile(relativePath);
      const url = URL.createObjectURL(file);
      if (blank) blank.location.replace(url);
      else download(file, file.name);
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (error) {
      if (blank) blank.close();
      alert(error && error.message ? error.message : 'The document could not be opened.');
    }
  }

  async function chooseLocation(kind) {
    let handle;
    if (kind === HANDLE_BUDGET && typeof window.showOpenFilePicker === 'function') {
      handle = await window.showOpenFilePicker({
        id: 'project-tools-price-lists',
        multiple: true,
        types: [{
          description: 'Excel price-list workbooks',
          accept: {
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
            'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'],
          },
        }],
      });
    } else {
      if (typeof window.showDirectoryPicker !== 'function') {
        throw new Error('Remembered local files require desktop Chrome or Microsoft Edge.');
      }
      handle = await window.showDirectoryPicker({
        id: kind === HANDLE_LIBRARY ? 'project-tools-library' : 'project-tools-price-lists',
        mode: 'read',
      });
    }
    const inventory = kind === HANDLE_LIBRARY ? await validateLibraryHandle(handle, true, true) : null;
    const budgetInventory = kind === HANDLE_BUDGET ? await validateBudgetHandle(handle, true, true) : null;
    await saveHandle(kind, handle);
    if (kind === HANDLE_LIBRARY) {
      libraryHandle = handle;
      publishLibraryInventory(inventory);
    }
    else {
      budgetHandle = handle;
      activeBudgetInventory = budgetInventory;
    }
    await refreshSettings();
    return handle;
  }

  async function reconnect(kind) {
    const handle = kind === HANDLE_LIBRARY ? libraryHandle : budgetHandle;
    if (!handle) return chooseLocation(kind);
    const state = await selectionPermission(handle, true);
    if (state !== 'granted') throw new Error('Folder access was not granted.');
    try {
      if (kind === HANDLE_LIBRARY) publishLibraryInventory(await validateLibraryHandle(handle, false, true));
      else activeBudgetInventory = await validateBudgetHandle(handle, false, true);
    } catch (_) {
      return chooseLocation(kind);
    }
    await refreshSettings();
    return handle;
  }

  async function clearLocation(kind) {
    await forgetHandle(kind);
    if (kind === HANDLE_LIBRARY) {
      libraryHandle = null;
      publishLibraryInventory(null);
    }
    else {
      budgetHandle = null;
      activeBudgetInventory = null;
    }
    await refreshSettings();
  }

  function describeHandle(handle, state, fallback, validationError, connectedDetail, missingAction = 'Select folder') {
    if (!handle) return { text: fallback, state: 'missing', action: missingAction };
    const name = Array.isArray(handle) ? 'Selected price lists' : handle.name;
    if (state === 'granted' && !validationError) return { text: `${name} · ${connectedDetail || 'connected and verified'}`, state: 'connected', action: 'Connected' };
    if (state === 'granted') return { text: `${name} · ${validationError}`, state: 'missing', action: 'Choose again' };
    return { text: `${name} · remembered; reconnect required`, state: 'missing', action: 'Reconnect' };
  }

  async function refreshSettings() {
    if (!settingsDialog) return { libraryReady: false, budgetReady: false };
    const libraryState = await permission(libraryHandle, false);
    const budgetState = await selectionPermission(budgetHandle, false);
    let libraryValidation = '';
    let budgetValidation = '';
    let inventory = null;
    let budgetInventory = null;
    if (libraryState === 'granted') {
      try { inventory = await validateLibraryHandle(libraryHandle, false); }
      catch (_) { libraryValidation = 'library files not found at this level'; }
    }
    if (budgetState === 'granted') {
      try { budgetInventory = await validateBudgetHandle(budgetHandle, false); }
      catch (_) { budgetValidation = 'price-list workbooks not found at this level'; }
    }
    const libraryReady = libraryState === 'granted' && !libraryValidation;
    const budgetReady = budgetState === 'granted' && !budgetValidation;
    if (libraryReady) publishLibraryInventory(inventory);
    else publishLibraryInventory(null);
    activeBudgetInventory = budgetReady ? budgetInventory : null;
    const library = describeHandle(
      libraryHandle,
      libraryState,
      'No document library selected',
      libraryValidation,
      inventory ? `${inventory.files.length.toLocaleString()} file${inventory.files.length === 1 ? '' : 's'} available` : ''
    );
    const budget = describeHandle(
      budgetHandle,
      budgetState,
      'No price-list workbooks selected',
      budgetValidation,
      budgetInventory ? `${budgetInventory.files.length.toLocaleString()} workbook${budgetInventory.files.length === 1 ? '' : 's'} available` : '',
      'Select files'
    );
    libraryStatus.textContent = library.text;
    libraryStatus.dataset.state = library.state;
    budgetStatus.textContent = budget.text;
    budgetStatus.dataset.state = budget.state;
    libraryConnect.textContent = library.action;
    libraryConnect.disabled = libraryReady;
    budgetConnect.textContent = budget.action;
    budgetConnect.disabled = budgetReady;
    if (settingsButton) {
      settingsButton.dataset.state = libraryReady && budgetReady ? 'ready' : 'attention';
      settingsButton.title = libraryReady && budgetReady
        ? 'Local folders connected'
        : 'Local folders need attention';
    }
    return { libraryReady, budgetReady };
  }

  function openSettings() {
    if (!settingsDialog) return;
    refreshSettings();
    settingsDialog.hidden = false;
  }

  function closeSettings() {
    if (settingsDialog) settingsDialog.hidden = true;
  }

  function createSettings() {
    settingsDialog = document.createElement('section');
    settingsDialog.className = 'local-files-dialog';
    settingsDialog.hidden = true;
    settingsDialog.setAttribute('role', 'dialog');
    settingsDialog.setAttribute('aria-modal', 'true');
    settingsDialog.setAttribute('aria-labelledby', 'local-files-title');
    settingsDialog.innerHTML = `
      <div class="local-card local-files-card">
        <p class="local-eyebrow">This browser</p>
        <h2 id="local-files-title">Local file locations</h2>
        <p class="local-intro">Choose these folders once. This browser remembers the folder handles and reads current files directly from your computer. Files and prices are never uploaded to GitHub.</p>
        <div class="local-file-source">
          <div class="local-file-copy"><strong>Document library</strong><span id="local-library-status"></span></div>
          <div class="local-file-actions">
            <button class="local-secondary" id="local-library-connect" type="button"></button>
            <button class="local-secondary" id="local-library-change" type="button">Change…</button>
            <button class="local-text-button" id="local-library-forget" type="button">Forget</button>
          </div>
        </div>
        <div class="local-file-source">
          <div class="local-file-copy"><strong>Budget price-list workbooks</strong><span id="local-budget-status"></span></div>
          <div class="local-file-actions">
            <button class="local-secondary" id="local-budget-connect" type="button"></button>
            <button class="local-secondary" id="local-budget-change" type="button">Change…</button>
            <button class="local-text-button" id="local-budget-forget" type="button">Forget</button>
          </div>
        </div>
        <p class="local-error" id="local-files-error" role="alert" hidden></p>
        <p class="local-note">For pricing, select all three .xlsx or .xlsm workbooks in the file window (Ctrl+A is fine). The browser remembers them and reads current prices directly from those files. If the browser clears site data, you use a different browser profile, or a file is moved, choose it again.</p>
        <div class="local-files-footer">
          <button class="local-text-button" id="local-reset-account" type="button">Reset this browser’s login</button>
          <button class="local-primary" id="local-files-done" type="button">Done</button>
        </div>
      </div>`;
    document.body.append(settingsDialog);
    libraryStatus = settingsDialog.querySelector('#local-library-status');
    budgetStatus = settingsDialog.querySelector('#local-budget-status');
    libraryConnect = settingsDialog.querySelector('#local-library-connect');
    budgetConnect = settingsDialog.querySelector('#local-budget-connect');
    const error = settingsDialog.querySelector('#local-files-error');
    const run = async operation => {
      error.hidden = true;
      try { await operation(); }
      catch (failure) {
        if (failure && failure.name === 'AbortError') return;
        error.textContent = failure && failure.message ? failure.message : 'The folder could not be connected.';
        error.hidden = false;
      }
    };
    libraryConnect.addEventListener('click', () => run(() => reconnect(HANDLE_LIBRARY)));
    budgetConnect.addEventListener('click', () => run(() => reconnect(HANDLE_BUDGET)));
    settingsDialog.querySelector('#local-library-change').addEventListener('click', () => run(() => chooseLocation(HANDLE_LIBRARY)));
    settingsDialog.querySelector('#local-budget-change').addEventListener('click', () => run(() => chooseLocation(HANDLE_BUDGET)));
    settingsDialog.querySelector('#local-library-forget').addEventListener('click', () => run(() => clearLocation(HANDLE_LIBRARY)));
    settingsDialog.querySelector('#local-budget-forget').addEventListener('click', () => run(() => clearLocation(HANDLE_BUDGET)));
    settingsDialog.querySelector('#local-files-done').addEventListener('click', closeSettings);
    settingsDialog.querySelector('#local-reset-account').addEventListener('click', () => {
      if (!confirm('Reset the local username and password saved in this browser? Folder selections will remain remembered.')) return;
      localStorage.removeItem(ACCOUNT_KEY);
      sessionStorage.removeItem(SESSION_KEY);
      location.reload();
    });
    settingsDialog.addEventListener('click', event => {
      if (event.target === settingsDialog) closeSettings();
    });
  }

  function addSettingsButton() {
    const actions = document.querySelector('.rail-actions');
    if (!actions) return;
    settingsButton = document.createElement('button');
    settingsButton.className = 'rail-action local-files-button';
    settingsButton.id = 'local-files-button';
    settingsButton.type = 'button';
    settingsButton.innerHTML = '<span aria-hidden="true">⌂</span><span>Local files</span>';
    settingsButton.addEventListener('click', openSettings);
    const signOut = document.getElementById('sign-out-button');
    actions.insertBefore(settingsButton, signOut || null);
  }

  async function restoreLocations() {
    try {
      [libraryHandle, budgetHandle] = await Promise.all([
        getSavedHandle(HANDLE_LIBRARY),
        getSavedHandle(HANDLE_BUDGET),
      ]);
    } catch (_) {
      libraryHandle = null;
      budgetHandle = null;
    }
    const readiness = await refreshSettings();
    if (!readiness.libraryReady || !readiness.budgetReady) openSettings();
  }

  function unlockApplication() {
    document.documentElement.classList.remove('project-tools-locked');
    document.documentElement.classList.add('project-tools-authenticated');
    if (!settingsDialog) createSettings();
    if (!settingsButton) addSettingsButton();
    restoreLocations();
  }

  function signOut() {
    sessionStorage.removeItem(SESSION_KEY);
    location.reload();
  }

  document.addEventListener('click', event => {
    const link = event.target.closest && event.target.closest('a[href^="#local-document="]');
    if (!link) return;
    event.preventDefault();
    event.stopPropagation();
    const relativePath = decodeURIComponent(link.getAttribute('href').slice('#local-document='.length));
    openDocument(relativePath);
  }, true);

  document.addEventListener('DOMContentLoaded', () => {
    const account = readAccount();
    if (account && sessionStorage.getItem(SESSION_KEY) === 'active') unlockApplication();
    else createGate(account);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(new URL('sw.js', PAGE_ROOT)).catch(() => {});
    }
  }, { once: true });

  window.ProjectToolsLocalFiles = Object.freeze({
    getLibraryFile,
    readBudgetWorkbook,
    exportBundle,
    hasDocument,
    isLibraryReady,
    openSettings,
    signOut,
  });
})();
