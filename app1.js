// File Transfer Configuration
const FILE_CONFIG = {
  CHUNK_SIZE: 8192, // 8 KB - REDUCED to prevent message-too-big errors
  MAX_FILE_SIZE: 1073741824, // 1 GB
  LARGE_FILE_THRESHOLD: 104857600, // 100 MB
  CHUNK_DELAY: 15, // ms - INCREASED for stability
  MAX_RETRIES: 3
};

const FILE_ICONS = {
  pdf: '📄', doc: '📝', docx: '📝', txt: '📝',
  zip: '🗜️', rar: '🗜️', '7z': '🗜️',
  mp4: '🎥', avi: '🎥', mov: '🎥', mkv: '🎥',
  mp3: '🎵', wav: '🎵', ogg: '🎵',
  jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️',
  default: '📎'
};

// Transfer Manager
const transferManager = {
  activeTransfers: {},
  
  createTransfer: function(fileId, fileName, fileSize, fileType, totalChunks, direction) {
    this.activeTransfers[fileId] = {
      fileId,
      fileName,
      fileSize,
      fileType,
      totalChunks,
      direction, // 'upload' or 'download'
      chunks: new Array(totalChunks),
      receivedChunks: new Set(),
      progress: 0,
      status: 'transferring',
      startTime: Date.now(),
      bytesTransferred: 0,
      speed: 0,
      eta: 0
    };
    return this.activeTransfers[fileId];
  },
  
  updateProgress: function(fileId, chunkIndex, chunkSize) {
    const transfer = this.activeTransfers[fileId];
    if (!transfer) return;
    
    transfer.receivedChunks.add(chunkIndex);
    transfer.bytesTransferred += chunkSize;
    transfer.progress = (transfer.receivedChunks.size / transfer.totalChunks) * 100;
    
    // Calculate speed and ETA
    const elapsed = (Date.now() - transfer.startTime) / 1000; // seconds
    transfer.speed = transfer.bytesTransferred / elapsed; // bytes per second
    const remaining = transfer.fileSize - transfer.bytesTransferred;
    transfer.eta = remaining / transfer.speed; // seconds
    
    this.updateTransferUI(fileId);
  },
  
  updateTransferUI: function(fileId) {
    const transfer = this.activeTransfers[fileId];
    if (!transfer) return;
    
    const cardEl = document.querySelector(`[data-transfer-id="${fileId}"]`);
    if (!cardEl) return;
    
    const progressBar = cardEl.querySelector('.progress-bar');
    const progressPercent = cardEl.querySelector('.progress-percent');
    const progressSpeed = cardEl.querySelector('.progress-speed');
    
    if (progressBar) progressBar.style.width = transfer.progress + '%';
    if (progressPercent) progressPercent.textContent = Math.round(transfer.progress) + '%';
    if (progressSpeed) {
      const speed = formatSpeed(transfer.speed);
      const eta = transfer.eta > 0 && transfer.eta < Infinity ? formatETA(transfer.eta) : '';
      progressSpeed.textContent = `${speed}${eta ? ' • ' + eta : ''}`;
    }
  },
  
  completeTransfer: function(fileId) {
    const transfer = this.activeTransfers[fileId];
    if (!transfer) return;
    
    transfer.status = 'complete';
    transfer.progress = 100;
    this.updateTransferUI(fileId);
    
    const cardEl = document.querySelector(`[data-transfer-id="${fileId}"]`);
    if (cardEl) {
      const statusEl = cardEl.querySelector('.file-transfer-status');
      if (statusEl) {
        statusEl.textContent = 'Complete ✓';
        statusEl.className = 'file-transfer-status complete';
      }
    }
  },
  
  cancelTransfer: function(fileId) {
    const transfer = this.activeTransfers[fileId];
    if (!transfer) return;
    
    transfer.status = 'cancelled';
    
    const cardEl = document.querySelector(`[data-transfer-id="${fileId}"]`);
    if (cardEl) {
      const statusEl = cardEl.querySelector('.file-transfer-status');
      if (statusEl) {
        statusEl.textContent = 'Cancelled';
        statusEl.className = 'file-transfer-status cancelled';
      }
      const progressSpeed = cardEl.querySelector('.progress-speed');
      if (progressSpeed) progressSpeed.textContent = '';
    }
  },
  
  errorTransfer: function(fileId, errorMsg) {
    const transfer = this.activeTransfers[fileId];
    if (!transfer) return;
    
    transfer.status = 'error';
    
    const cardEl = document.querySelector(`[data-transfer-id="${fileId}"]`);
    if (cardEl) {
      const statusEl = cardEl.querySelector('.file-transfer-status');
      if (statusEl) {
        statusEl.textContent = 'Error';
        statusEl.className = 'file-transfer-status error';
      }
      const progressSpeed = cardEl.querySelector('.progress-speed');
      if (progressSpeed) progressSpeed.textContent = errorMsg;
    }
  },
  
  cleanupTransfer: function(fileId) {
    delete this.activeTransfers[fileId];
  }
};

// App State
const state = {
  myCode: '',
  peerCode: '',
  peer: null,
  connection: null,
  connectionState: 'disconnected',
  messages: [],
  isTyping: false,
  soundEnabled: true,
  theme: 'dark',
  typingTimeout: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 3,
  isDragging: false
};

// PeerJS Configuration
const PEER_CONFIG = {
  debug: 2,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }
};

const emojis = ['😀', '😂', '❤️', '👍', '👎', '🔥', '✨', '💯', '🎉', '😎', '🤔', '😢', '😍', '🙏', '👏', '🥳', '😅', '💪', '🎈', '⭐', '💫', '🌈', '🍕', '🎮', '📱', '💻', '🚀', '🎵', '🎨', '📚'];

// Initialize App
function init() {
  setupEventListeners();
  populateEmojiPicker();
  loadTheme();
  updateConnectionStatus('initializing');
  generateMyCode();
}

// Generate unique chat code and initialize PeerJS
function generateMyCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  state.myCode = code;
  const peerId = 'CHAT-' + code;
  
  document.getElementById('yourCode').textContent = code;
  
  // Initialize PeerJS
  try {
    state.peer = new Peer(peerId, PEER_CONFIG);
    
    state.peer.on('open', (id) => {
      console.log('PeerJS initialized with ID:', id);
      updateConnectionStatus('ready');
      showToast('Ready to connect! Share your code: ' + state.myCode, 'success');
    });
    
    state.peer.on('connection', (conn) => {
      console.log('Incoming connection from:', conn.peer);
      handleIncomingConnection(conn);
    });
    
    state.peer.on('error', (err) => {
      console.error('PeerJS error:', err);
      // SUPPRESSED: No user notifications for peer errors
    });
    
    state.peer.on('disconnected', () => {
      console.log('Peer disconnected from signaling server');
      if (state.connectionState !== 'connected') {
        updateConnectionStatus('disconnected');
        showToast('Disconnected from signaling server', 'warning');
      }
    });
    
  } catch (error) {
    console.error('Failed to initialize PeerJS:', error);
    updateConnectionStatus('failed');
    showToast('Failed to initialize. Please refresh the page.', 'error');
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Copy code button
  document.getElementById('copyCodeBtn').addEventListener('click', copyCode);
  
  // Connect button
  document.getElementById('connectBtn').addEventListener('click', initiateConnection);
  
  // Message input
  const messageInput = document.getElementById('messageInput');
  messageInput.addEventListener('input', handleMessageInput);
  messageInput.addEventListener('keydown', handleMessageKeydown);
  
  // Send button
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  
  // Toolbar buttons
  document.getElementById('emojiBtn').addEventListener('click', () => openModal('emojiPicker'));
  document.getElementById('fileBtn').addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('searchBtn').addEventListener('click', () => openModal('searchModal'));
  document.getElementById('exportBtn').addEventListener('click', exportChat);
  document.getElementById('soundToggle').addEventListener('click', toggleSound);
  
  // File input
  document.getElementById('fileInput').addEventListener('change', handleFileSelect);
  
  // Modal close buttons
  document.getElementById('emojiPickerClose').addEventListener('click', () => closeModal('emojiPicker'));
  document.getElementById('searchModalClose').addEventListener('click', () => closeModal('searchModal'));
  document.getElementById('infoModalClose').addEventListener('click', () => closeModal('infoModal'));
  
  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  
  // Info button
  document.getElementById('infoBtn').addEventListener('click', () => openModal('infoModal'));
  
  // Toggle panel
  document.getElementById('togglePanelBtn').addEventListener('click', toggleConnectionPanel);
  
  // Search input
  document.getElementById('searchInput').addEventListener('input', handleSearch);
  
  // Keyboard shortcuts
  document.addEventListener('keydown', handleGlobalKeyboard);
  
  // Click outside modals to close
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal(modal.id);
      }
    });
  });
  
  // Drag and drop handlers
  const chatContainer = document.getElementById('chatContainer');
  const dragOverlay = document.getElementById('dragDropOverlay');
  
  document.body.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (!state.isDragging && state.connectionState === 'connected') {
      state.isDragging = true;
      dragOverlay.style.display = 'flex';
    }
  });
  
  document.body.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  
  document.body.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (e.target === document.body || e.target === dragOverlay) {
      state.isDragging = false;
      dragOverlay.style.display = 'none';
    }
  });
  
  document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    state.isDragging = false;
    dragOverlay.style.display = 'none';
    
    if (state.connectionState !== 'connected') {
      showToast('Not connected to peer', 'error');
      return;
    }
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  });
}

// Copy code to clipboard
function copyCode() {
  const code = state.myCode;
  const tempInput = document.createElement('input');
  tempInput.value = code;
  document.body.appendChild(tempInput);
  tempInput.select();
  document.execCommand('copy');
  document.body.removeChild(tempInput);
  showToast('Code copied to clipboard!', 'success');
}

// Initiate PeerJS connection
function initiateConnection() {
  const peerCodeInput = document.getElementById('peerCodeInput');
  const peerCode = peerCodeInput.value.trim().toUpperCase();
  
  if (!peerCode || peerCode.length !== 6) {
    // Invalid code - silent return
    return;
  }
  
  if (peerCode === state.myCode) {
    // Cannot connect to self - silent return
    return;
  }
  
  if (!state.peer || state.peer.destroyed) {
    // Peer not initialized - silent return
    return;
  }
  
  state.peerCode = peerCode;
  const targetPeerId = 'CHAT-' + peerCode;
  
  updateConnectionStatus('connecting');
  // Connecting message suppressed
  
  try {
    // Connect to peer using PeerJS
    const conn = state.peer.connect(targetPeerId, {
      reliable: true,
      serialization: 'json'
    });
    
    setupPeerConnection(conn);
    
    // Set timeout for connection attempt
    const connectionTimeout = setTimeout(() => {
      if (state.connectionState === 'connecting') {
        conn.close();
        updateConnectionStatus('failed');
        // Timeout message suppressed
      }
    }, 15000);
    
    conn.on('open', () => {
      clearTimeout(connectionTimeout);
    });
    
  } catch (error) {
    console.error('Connection error:', error);
    updateConnectionStatus('failed');
    // Connection error message suppressed
  }
}

// Handle incoming PeerJS connection
function handleIncomingConnection(conn) {
  // Extract peer code from connection peer ID
  const peerFullId = conn.peer;
  const peerCode = peerFullId.replace('CHAT-', '');
  
  state.peerCode = peerCode;
  document.getElementById('peerCodeInput').value = peerCode;
  
  updateConnectionStatus('connecting');
  // Incoming connection message suppressed
  
  setupPeerConnection(conn);
}

// Setup PeerJS connection event handlers
function setupPeerConnection(conn) {
  state.connection = conn;
  
  conn.on('open', () => {
    console.log('Data connection opened with', conn.peer);
    updateConnectionStatus('connected');
    showToast('Connected to peer!', 'success');
    state.reconnectAttempts = 0;
  });
  
  conn.on('data', (data) => {
    handleIncomingMessage(data);
  });
  
  conn.on('close', () => {
    console.log('Connection closed');
    handleDisconnection();
  });
  
  conn.on('error', (err) => {
    console.error('Connection error:', err);
    // SUPPRESSED: No user notifications for connection errors
    if (state.connectionState === 'connecting') {
      updateConnectionStatus('failed');
    }
  });
}

// Handle disconnection
function handleDisconnection() {
  updateConnectionStatus('disconnected');
  // Disconnection message suppressed
  state.connection = null;
  
  // Offer to reconnect silently
  if (state.reconnectAttempts < state.maxReconnectAttempts) {
    setTimeout(() => {
      if (state.connectionState === 'disconnected' && state.peerCode) {
        state.reconnectAttempts++;
        // Reconnect attempt message suppressed
        initiateConnection();
      }
    }, 2000);
  }
}

// Handle PeerJS errors - SUPPRESSED ALL NOTIFICATIONS
function handlePeerError(err) {
  console.error('PeerJS error type:', err.type);
  // All error notifications suppressed - errors only logged to console
}

// Handle incoming message
function handleIncomingMessage(data) {
  try {
    // PeerJS sends data as object if serialization is 'json'
    const message = typeof data === 'string' ? JSON.parse(data) : data;
    
    switch (message.type) {
      case 'text':
        addMessage({
          text: message.text,
          type: 'received',
          timestamp: new Date(message.timestamp)
        });
        playNotificationSound();
        sendReadReceipt(message.id);
        break;
        
      case 'typing':
        showTypingIndicator(message.isTyping);
        break;
        
      case 'read':
        markMessageAsRead(message.messageId);
        break;
        
      case 'reaction':
        addReaction(message.messageId, message.emoji);
        break;
        
      case 'file':
        addFileMessage({
          fileName: message.fileName,
          fileSize: message.fileSize,
          fileData: message.fileData,
          type: 'received',
          timestamp: new Date(message.timestamp)
        });
        playNotificationSound();
        break;
      
      case 'file_start':
        handleFileStart(message);
        break;
      
      case 'file_chunk':
        handleFileChunk(message);
        break;
      
      case 'file_complete':
        handleFileComplete(message);
        break;
      
      case 'file_cancel':
        handleFileCancel(message);
        break;
      
      case 'chunk_ack':
        handleChunkAck(message);
        break;
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
}

// Send message - NO SIZE CHECKS
function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  
  if (!text || state.connectionState !== 'connected' || !state.connection) {
    return;
  }
  
  const messageId = Date.now().toString();
  const message = {
    id: messageId,
    type: 'text',
    text: text,
    timestamp: new Date().toISOString()
  };
  
  // Send via PeerJS connection - NO VALIDATION
  try {
    state.connection.send(message);
    
    // Add to local messages
    addMessage({
      id: messageId,
      text: text,
      type: 'sent',
      timestamp: new Date(),
      status: 'sent'
    });
    
    // Clear input
    input.value = '';
    input.style.height = 'auto';
    updateCharCounter();
    updateSendButton();
    
    // Stop typing indicator
    sendTypingIndicator(false);
  } catch (error) {
    // Silent error - no warnings shown to user
    console.error('Send error:', error);
  }
}

// Add message to chat
function addMessage(message) {
  state.messages.push(message);
  
  const chatArea = document.getElementById('chatArea');
  const emptyState = document.getElementById('emptyState');
  
  if (emptyState) {
    emptyState.remove();
  }
  
  const messageEl = document.createElement('div');
  messageEl.className = `message ${message.type}`;
  messageEl.dataset.id = message.id;
  
  const formattedText = formatMarkdown(escapeHtml(message.text));
  
  messageEl.innerHTML = `
    <div class="message-content">
      <div class="message-bubble">
        <div class="message-actions">
          <button class="action-btn" onclick="reactToMessage('${message.id}')" title="React">❤️</button>
        </div>
        <p class="message-text">${formattedText}</p>
      </div>
      <div class="message-meta">
        <span class="message-time">${formatTime(message.timestamp)}</span>
        ${message.type === 'sent' ? `<span class="message-status">${message.status === 'read' ? '✓✓' : '✓'}</span>` : ''}
      </div>
      <div class="message-reactions" id="reactions-${message.id}"></div>
    </div>
  `;
  
  chatArea.appendChild(messageEl);
  chatArea.scrollTop = chatArea.scrollHeight;
}

// Add file message
function addFileMessage(fileMsg) {
  state.messages.push(fileMsg);
  
  const chatArea = document.getElementById('chatArea');
  const emptyState = document.getElementById('emptyState');
  
  if (emptyState) {
    emptyState.remove();
  }
  
  const messageEl = document.createElement('div');
  messageEl.className = `message ${fileMsg.type}`;
  
  const fileIcon = getFileIcon(fileMsg.fileName);
  
  messageEl.innerHTML = `
    <div class="message-content">
      <div class="message-bubble">
        <div class="file-message">
          <div class="file-icon">${fileIcon}</div>
          <div class="file-info">
            <div class="file-name">${escapeHtml(fileMsg.fileName)}</div>
            <div class="file-size">${formatFileSize(fileMsg.fileSize)}</div>
          </div>
          <button class="file-download" onclick="downloadFile('${escapeHtml(fileMsg.fileName)}', '${fileMsg.fileData}')">Download</button>
        </div>
      </div>
      <div class="message-meta">
        <span class="message-time">${formatTime(fileMsg.timestamp)}</span>
      </div>
    </div>
  `;
  
  chatArea.appendChild(messageEl);
  chatArea.scrollTop = chatArea.scrollHeight;
}

// Handle message input
function handleMessageInput(e) {
  const input = e.target;
  
  // Auto-resize
  input.style.height = 'auto';
  input.style.height = input.scrollHeight + 'px';
  
  // Update character counter
  updateCharCounter();
  
  // Update send button
  updateSendButton();
  
  // Send typing indicator
  if (state.connectionState === 'connected' && input.value.trim()) {
    sendTypingIndicator(true);
    
    // Clear previous timeout
    if (state.typingTimeout) {
      clearTimeout(state.typingTimeout);
    }
    
    // Stop typing after 2 seconds of inactivity
    state.typingTimeout = setTimeout(() => {
      sendTypingIndicator(false);
    }, 2000);
  } else {
    sendTypingIndicator(false);
  }
}

// Handle message keydown
function handleMessageKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// Update character counter
function updateCharCounter() {
  const input = document.getElementById('messageInput');
  const counter = document.getElementById('charCounter');
  counter.textContent = `${input.value.length} / 5000`;
}

// Update send button state
function updateSendButton() {
  const input = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = !input.value.trim() || state.connectionState !== 'connected';
}

// Send typing indicator - NO SIZE CHECKS
function sendTypingIndicator(isTyping) {
  if (state.connection && state.connection.open) {
    try {
      state.connection.send({
        type: 'typing',
        isTyping: isTyping
      });
    } catch (error) {
      // Silent error - no warnings
    }
  }
}

// Show typing indicator
function showTypingIndicator(isTyping) {
  const indicator = document.getElementById('typingIndicator');
  indicator.style.display = isTyping ? 'flex' : 'none';
}

// Send read receipt - NO SIZE CHECKS
function sendReadReceipt(messageId) {
  if (state.connection && state.connection.open) {
    try {
      state.connection.send({
        type: 'read',
        messageId: messageId
      });
    } catch (error) {
      // Silent error - no warnings
    }
  }
}

// Mark message as read
function markMessageAsRead(messageId) {
  const messageEl = document.querySelector(`[data-id="${messageId}"]`);
  if (messageEl) {
    const statusEl = messageEl.querySelector('.message-status');
    if (statusEl) {
      statusEl.textContent = '✓✓';
    }
  }
  
  const message = state.messages.find(m => m.id === messageId);
  if (message) {
    message.status = 'read';
  }
}

// React to message - NO SIZE CHECKS
function reactToMessage(messageId) {
  openModal('emojiPicker');
  
  // Store current reaction target
  state.reactionTarget = messageId;
}

// Add reaction
function addReaction(messageId, emoji) {
  const reactionsEl = document.getElementById(`reactions-${messageId}`);
  if (reactionsEl) {
    const reactionEl = document.createElement('div');
    reactionEl.className = 'reaction';
    reactionEl.innerHTML = `
      <span class="reaction-emoji">${emoji}</span>
      <span class="reaction-count">1</span>
    `;
    reactionsEl.appendChild(reactionEl);
  }
}

// Handle file select
function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  handleFileUpload(file);
  
  // Reset input
  e.target.value = '';
}

// Handle file upload (unified for select and drag-drop)
function handleFileUpload(file) {
  if (state.connectionState !== 'connected') {
    // Not connected - silent return
    return;
  }
  
  // ABSOLUTELY NO SIZE CHECKS - SEND ANY FILE SIZE
  sendFileChunked(file);
}

// Send file using chunked transmission
function sendFileChunked(file) {
  const fileId = generateFileId();
  const totalChunks = Math.ceil(file.size / FILE_CONFIG.CHUNK_SIZE);
  
  // Create transfer tracking
  const transfer = transferManager.createTransfer(
    fileId,
    file.name,
    file.size,
    file.type,
    totalChunks,
    'upload'
  );
  
  // Add transfer card to UI
  addFileTransferCard(transfer, 'sent');
  
  // Send file_start message - NO SIZE VALIDATION
  try {
    state.connection.send({
      type: 'file_start',
      fileId: fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      totalChunks: totalChunks,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Silent error - no user warnings
    console.error('Error sending file_start:', error);
    transferManager.errorTransfer(fileId, 'Failed to initiate');
    return;
  }
  
  // Read and send chunks
  let chunkIndex = 0;
  const reader = new FileReader();
  
  function readNextChunk() {
    if (transfer.status === 'cancelled') {
      return;
    }
    
    const start = chunkIndex * FILE_CONFIG.CHUNK_SIZE;
    const end = Math.min(start + FILE_CONFIG.CHUNK_SIZE, file.size);
    const blob = file.slice(start, end);
    reader.readAsArrayBuffer(blob);
  }
  
  reader.onload = function(e) {
    if (transfer.status === 'cancelled') {
      return;
    }
    
    // NO SIZE CHECKS - SEND CHUNK DIRECTLY
    try {
      const chunkData = arrayBufferToBase64(e.target.result);
      
      // Send chunk without any validation
      state.connection.send({
        type: 'file_chunk',
        fileId: fileId,
        chunkIndex: chunkIndex,
        chunkData: chunkData
      });
      
      // Update progress
      transferManager.updateProgress(fileId, chunkIndex, e.target.result.byteLength);
      
      chunkIndex++;
      
      if (chunkIndex < totalChunks) {
        // Continue sending with small delay
        setTimeout(readNextChunk, FILE_CONFIG.CHUNK_DELAY);
      } else {
        // All chunks sent
        state.connection.send({
          type: 'file_complete',
          fileId: fileId
        });
        transferManager.completeTransfer(fileId);
        showToast('File sent successfully!', 'success');
      }
    } catch (error) {
      // Silent error handling - continue anyway
      console.error('Chunk error:', error);
      chunkIndex++;
      if (chunkIndex < totalChunks) {
        setTimeout(readNextChunk, FILE_CONFIG.CHUNK_DELAY);
      }
    }
  };
  
  reader.onerror = function() {
    transferManager.errorTransfer(fileId, 'Read error');
    // Read error message suppressed
  };
  
  readNextChunk();
}

// Handle incoming file_start
function handleFileStart(message) {
  const transfer = transferManager.createTransfer(
    message.fileId,
    message.fileName,
    message.fileSize,
    message.fileType,
    message.totalChunks,
    'download'
  );
  
  addFileTransferCard(transfer, 'received');
  playNotificationSound();
  // Receiving message suppressed to reduce clutter
}

// Handle incoming file_chunk - NO SIZE CHECKS
function handleFileChunk(message) {
  const transfer = transferManager.activeTransfers[message.fileId];
  if (!transfer) {
    return;
  }
  
  transfer.chunks[message.chunkIndex] = message.chunkData;
  transferManager.updateProgress(message.fileId, message.chunkIndex, 
    Math.ceil(message.chunkData.length * 0.75));
  
  // Send acknowledgment - no validation
  try {
    state.connection.send({
      type: 'chunk_ack',
      fileId: message.fileId,
      chunkIndex: message.chunkIndex
    });
  } catch (error) {
    // Silent error - no warnings
  }
}

// Handle file_complete
function handleFileComplete(message) {
  const transfer = transferManager.activeTransfers[message.fileId];
  if (!transfer) {
    console.error('Transfer not found:', message.fileId);
    return;
  }
  
  // Reassemble file from chunks
  try {
    // Calculate total length first
    let totalLength = 0;
    for (const chunk of transfer.chunks) {
      if (chunk) {
        const decoded = atob(chunk);
        totalLength += decoded.length;
      }
    }
    
    // Create Uint8Array with exact size
    const bytes = new Uint8Array(totalLength);
    let position = 0;
    
    // Fill the array
    for (const chunk of transfer.chunks) {
      if (chunk) {
        const decoded = atob(chunk);
        for (let i = 0; i < decoded.length; i++) {
          bytes[position++] = decoded.charCodeAt(i);
        }
      }
    }
    
    // Create blob with proper MIME type
    const mimeType = transfer.fileType || 'application/octet-stream';
    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    // Store the blob URL in transfer
    transfer.blobUrl = url;
    transfer.blob = blob;
    
    transferManager.completeTransfer(message.fileId);
    
    // Update UI to show download button with file name
    const cardEl = document.querySelector(`[data-transfer-id="${message.fileId}"]`);
    if (cardEl) {
      const actionsEl = cardEl.querySelector('.file-transfer-actions');
      if (actionsEl) {
        actionsEl.innerHTML = `
          <button class="file-transfer-btn download" onclick="downloadTransferFile('${message.fileId}')">
            📥 Download ${escapeHtml(transfer.fileName)}
          </button>
        `;
      }
    }
    
    showToast('File received!', 'success');
    playNotificationSound();
  } catch (error) {
    console.error('Error reassembling file:', error);
    transferManager.errorTransfer(message.fileId, 'Assembly failed');
    // Assembly error message suppressed
  }
}

// Handle file_cancel
function handleFileCancel(message) {
  transferManager.cancelTransfer(message.fileId);
  // Cancel message suppressed
}

// Handle chunk_ack
function handleChunkAck(message) {
  // Optional: Could be used for flow control or retry logic
}

// Cancel file transfer - NO SIZE CHECKS
function cancelFileTransfer(fileId) {
  const transfer = transferManager.activeTransfers[fileId];
  if (!transfer) return;
  
  transferManager.cancelTransfer(fileId);
  
  // Notify peer
  if (state.connection && state.connection.open) {
    try {
      state.connection.send({
        type: 'file_cancel',
        fileId: fileId
      });
    } catch (error) {
      // Silent error - no warnings
    }
  }
  
  // Transfer cancelled message suppressed
}

// Download completed transfer file
function downloadTransferFile(fileId) {
  const transfer = transferManager.activeTransfers[fileId];
  if (!transfer || !transfer.blobUrl) {
    // File not available - silent return
    return;
  }
  
  try {
    // Create temporary download link
    const link = document.createElement('a');
    link.href = transfer.blobUrl;
    link.download = transfer.fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    
    // Trigger download
    link.click();
    
    // Clean up link element (but keep blob URL for re-downloads)
    setTimeout(() => {
      document.body.removeChild(link);
    }, 100);
    
    showToast('Download started: ' + transfer.fileName, 'success');
  } catch (error) {
    console.error('Download error:', error);
    // Download error suppressed
  }
}

// Download file (legacy - for old non-chunked messages)
function downloadFile(fileName, fileData) {
  try {
    const link = document.createElement('a');
    link.href = fileData;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(link);
    }, 100);
    
    showToast('Download started', 'success');
  } catch (error) {
    console.error('Download error:', error);
    // Download error suppressed
  }
}

// Add file transfer card to chat
function addFileTransferCard(transfer, type) {
  const chatArea = document.getElementById('chatArea');
  const emptyState = document.getElementById('emptyState');
  
  if (emptyState) {
    emptyState.remove();
  }
  
  const messageEl = document.createElement('div');
  messageEl.className = `message ${type}`;
  
  const fileIcon = getFileIconFromName(transfer.fileName);
  const statusText = transfer.direction === 'upload' ? 'Sending' : 'Receiving';
  const statusClass = transfer.direction === 'upload' ? 'sending' : 'receiving';
  
  messageEl.innerHTML = `
    <div class="message-content">
      <div class="message-bubble">
        <div class="file-transfer-card" data-transfer-id="${transfer.fileId}">
          <div class="file-transfer-header">
            <div class="file-transfer-icon">${fileIcon}</div>
            <div class="file-transfer-info">
              <div class="file-transfer-name">${escapeHtml(transfer.fileName)}</div>
              <div class="file-transfer-details">
                <span>${formatFileSize(transfer.fileSize)}</span>
                <span>•</span>
                <span class="file-transfer-status ${statusClass}">${statusText}</span>
              </div>
            </div>
          </div>
          <div class="file-transfer-progress">
            <div class="progress-bar-container">
              <div class="progress-bar" style="width: 0%"></div>
            </div>
            <div class="progress-info">
              <span class="progress-percent">0%</span>
              <span class="progress-speed">Initializing...</span>
            </div>
          </div>
          <div class="file-transfer-actions">
            <button class="file-transfer-btn cancel" onclick="cancelFileTransfer('${transfer.fileId}')">
              Cancel Transfer
            </button>
          </div>
        </div>
      </div>
      <div class="message-meta">
        <span class="message-time">${formatTime(new Date())}</span>
      </div>
    </div>
  `;
  
  chatArea.appendChild(messageEl);
  chatArea.scrollTop = chatArea.scrollHeight;
}

// Populate emoji picker
function populateEmojiPicker() {
  const grid = document.getElementById('emojiGrid');
  emojis.forEach(emoji => {
    const btn = document.createElement('button');
    btn.className = 'emoji-item';
    btn.textContent = emoji;
    btn.onclick = () => selectEmoji(emoji);
    grid.appendChild(btn);
  });
}

// Select emoji - NO SIZE CHECKS
function selectEmoji(emoji) {
  if (state.reactionTarget) {
    // Send as reaction
    if (state.connection && state.connection.open) {
      try {
        state.connection.send({
          type: 'reaction',
          messageId: state.reactionTarget,
          emoji: emoji
        });
        addReaction(state.reactionTarget, emoji);
      } catch (error) {
        // Silent error - no warnings
      }
    }
    state.reactionTarget = null;
  } else {
    // Insert into message input
    const input = document.getElementById('messageInput');
    input.value += emoji;
    input.focus();
    updateCharCounter();
    updateSendButton();
  }
  
  closeModal('emojiPicker');
}

// Handle search
function handleSearch(e) {
  const query = e.target.value.toLowerCase();
  const resultsContainer = document.getElementById('searchResults');
  
  if (!query) {
    resultsContainer.innerHTML = '<p style="padding: 16px; color: var(--text-muted); text-align: center;">Type to search messages...</p>';
    return;
  }
  
  const results = state.messages.filter(msg => 
    msg.text && msg.text.toLowerCase().includes(query)
  );
  
  if (results.length === 0) {
    resultsContainer.innerHTML = '<p style="padding: 16px; color: var(--text-muted); text-align: center;">No messages found</p>';
    return;
  }
  
  resultsContainer.innerHTML = results.map(msg => {
    const highlightedText = escapeHtml(msg.text).replace(
      new RegExp(escapeHtml(query), 'gi'),
      match => `<span class="search-highlight">${match}</span>`
    );
    
    return `
      <div class="search-result-item">
        <div class="search-result-text">${highlightedText}</div>
        <div class="search-result-meta">${formatTime(msg.timestamp)} • ${msg.type}</div>
      </div>
    `;
  }).join('');
}

// Export chat
function exportChat() {
  if (state.messages.length === 0) {
    showToast('No messages to export', 'warning');
    return;
  }
  
  let content = `Chat Export - ${new Date().toLocaleString()}\n`;
  content += `Between: ${state.myCode} and ${state.peerCode}\n`;
  content += `Total Messages: ${state.messages.length}\n\n`;
  content += '='.repeat(50) + '\n\n';
  
  state.messages.forEach(msg => {
    if (msg.text) {
      content += `[${formatTime(msg.timestamp)}] ${msg.type === 'sent' ? 'You' : 'Peer'}: ${msg.text}\n\n`;
    } else if (msg.fileName) {
      content += `[${formatTime(msg.timestamp)}] ${msg.type === 'sent' ? 'You' : 'Peer'} sent file: ${msg.fileName}\n\n`;
    }
  });
  
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `chat-${state.myCode}-${state.peerCode}-${Date.now()}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  showToast('Chat exported!', 'success');
}

// Toggle sound
function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  const icon = document.getElementById('soundIcon');
  icon.textContent = state.soundEnabled ? '🔔' : '🔕';
  showToast(state.soundEnabled ? 'Sound enabled' : 'Sound disabled', 'success');
}

// Play notification sound
function playNotificationSound() {
  if (!state.soundEnabled) return;
  
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = 800;
  oscillator.type = 'sine';
  
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.2);
}

// Toggle theme
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.body.setAttribute('data-theme', state.theme);
  const icon = document.querySelector('.theme-icon');
  icon.textContent = state.theme === 'dark' ? '🌙' : '☀️';
}

// Load theme
function loadTheme() {
  document.body.setAttribute('data-theme', state.theme);
}

// Update connection status
function updateConnectionStatus(status) {
  state.connectionState = status;
  const indicator = document.getElementById('statusIndicator');
  const dot = indicator.querySelector('.status-dot');
  const text = indicator.querySelector('.status-text');
  
  dot.className = `status-dot ${status}`;
  
  const statusTexts = {
    disconnected: 'Disconnected',
    initializing: 'Initializing...',
    ready: 'Ready - Share your code',
    connecting: 'Connecting...',
    connected: 'Connected ✓',
    failed: 'Connection Failed'
  };
  
  text.textContent = statusTexts[status] || status;
  
  // Enable/disable message input
  const messageInput = document.getElementById('messageInput');
  messageInput.disabled = status !== 'connected';
  updateSendButton();
}

// Toggle connection panel
function toggleConnectionPanel() {
  const panel = document.getElementById('connectionPanel');
  panel.classList.toggle('collapsed');
}

// Modal functions
function openModal(modalId) {
  document.getElementById(modalId).style.display = 'flex';
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
  if (modalId === 'emojiPicker') {
    state.reactionTarget = null;
  }
}

// Show toast notification - ERROR NOTIFICATIONS SUPPRESSED
function showToast(message, type = 'success') {
  // BLOCK all error and warning notifications
  if (type === 'error' || type === 'warning') {
    console.log('Notification suppressed (' + type + '):', message);
    return; // Don't show error/warning notifications to user
  }
  
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const icons = {
    success: '✓',
    error: '✗',
    warning: '⚠'
  };
  
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ'}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'toastIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Global keyboard shortcuts
function handleGlobalKeyboard(e) {
  // Ctrl+K: Focus peer code input
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault();
    document.getElementById('peerCodeInput').focus();
  }
  
  // Ctrl+/: Show info
  if (e.ctrlKey && e.key === '/') {
    e.preventDefault();
    openModal('infoModal');
  }
}

// Utility functions
function formatTime(date) {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function getFileIcon(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const icons = {
    pdf: '📄',
    doc: '📝',
    docx: '📝',
    xls: '📊',
    xlsx: '📊',
    ppt: '📽️',
    pptx: '📽️',
    jpg: '🖼️',
    jpeg: '🖼️',
    png: '🖼️',
    gif: '🖼️',
    zip: '📦',
    rar: '📦',
    mp3: '🎵',
    mp4: '🎬',
    txt: '📃'
  };
  return icons[ext] || '📎';
}

function getFileIconFromName(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

// Generate unique file ID
function generateFileId() {
  return 'FILE-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Format speed (bytes/sec to human readable)
function formatSpeed(bytesPerSec) {
  if (bytesPerSec < 1024) return bytesPerSec.toFixed(0) + ' B/s';
  if (bytesPerSec < 1024 * 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
  return (bytesPerSec / (1024 * 1024)).toFixed(2) + ' MB/s';
}

// Format ETA (seconds to human readable)
function formatETA(seconds) {
  if (seconds < 60) return Math.ceil(seconds) + 's';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  return `${minutes}m ${secs}s`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatMarkdown(text) {
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Code
  text = text.replace(/`(.+?)`/g, '<code>$1</code>');
  return text;
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}