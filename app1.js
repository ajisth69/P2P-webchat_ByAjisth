// App State
const state = {
  myCode: '',
  peerCode: '',
  connection: null,
  dataChannel: null,
  connectionState: 'disconnected',
  messages: [],
  isTyping: false,
  soundEnabled: true,
  theme: 'dark',
  signalingBoard: {}, // Simulated signaling server
  typingTimeout: null
};

// Configuration
const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

const emojis = ['😀', '😂', '❤️', '👍', '👎', '🔥', '✨', '💯', '🎉', '😎', '🤔', '😢', '😍', '🙏', '👏', '🥳', '😅', '💪', '🎈', '⭐', '💫', '🌈', '🍕', '🎮', '📱', '💻', '🚀', '🎵', '🎨', '📚'];

// Initialize App
function init() {
  generateMyCode();
  setupEventListeners();
  populateEmojiPicker();
  loadTheme();
  updateConnectionStatus('disconnected');
  
  // Start polling for incoming connections
  setInterval(checkForIncomingConnections, 1000);
}

// Generate unique chat code
function generateMyCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  state.myCode = code;
  document.getElementById('yourCode').textContent = code;
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

// Initiate WebRTC connection
async function initiateConnection() {
  const peerCodeInput = document.getElementById('peerCodeInput');
  const peerCode = peerCodeInput.value.trim().toUpperCase();
  
  if (!peerCode || peerCode.length !== 6) {
    showToast('Please enter a valid 6-character code', 'error');
    return;
  }
  
  if (peerCode === state.myCode) {
    showToast('Cannot connect to yourself!', 'error');
    return;
  }
  
  state.peerCode = peerCode;
  updateConnectionStatus('connecting');
  
  try {
    // Create peer connection
    state.connection = new RTCPeerConnection(config);
    
    // Setup ICE candidate handling
    state.connection.onicecandidate = (event) => {
      if (event.candidate) {
        // In real app, send to signaling server
        // Here we store in simulated bulletin board
        if (!state.signalingBoard[state.myCode]) {
          state.signalingBoard[state.myCode] = {};
        }
        if (!state.signalingBoard[state.myCode].candidates) {
          state.signalingBoard[state.myCode].candidates = [];
        }
        state.signalingBoard[state.myCode].candidates.push(event.candidate);
      }
    };
    
    // Setup connection state change
    state.connection.onconnectionstatechange = () => {
      console.log('Connection state:', state.connection.connectionState);
      if (state.connection.connectionState === 'connected') {
        updateConnectionStatus('connected');
        showToast('Connected to peer!', 'success');
      } else if (state.connection.connectionState === 'disconnected' || 
                 state.connection.connectionState === 'failed') {
        updateConnectionStatus('disconnected');
        showToast('Connection lost', 'error');
      }
    };
    
    // Create data channel
    state.dataChannel = state.connection.createDataChannel('chat');
    setupDataChannel(state.dataChannel);
    
    // Create offer
    const offer = await state.connection.createOffer();
    await state.connection.setLocalDescription(offer);
    
    // Store offer in signaling board
    state.signalingBoard[state.myCode] = {
      offer: offer,
      target: peerCode,
      candidates: []
    };
    
    showToast('Waiting for peer to accept...', 'warning');
    
  } catch (error) {
    console.error('Connection error:', error);
    updateConnectionStatus('failed');
    showToast('Connection failed: ' + error.message, 'error');
  }
}

// Check for incoming connections (polling simulated signaling board)
async function checkForIncomingConnections() {
  if (state.connectionState === 'connected' || state.connectionState === 'connecting') {
    return;
  }
  
  // Check if someone is trying to connect to us
  for (const [fromCode, data] of Object.entries(state.signalingBoard)) {
    if (data.target === state.myCode && data.offer && !state.connection) {
      await handleIncomingConnection(fromCode, data);
      break;
    }
  }
  
  // Check for answers to our offers
  if (state.connection && state.peerCode) {
    const peerData = state.signalingBoard[state.peerCode];
    if (peerData && peerData.answer && state.connection.signalingState !== 'stable') {
      await state.connection.setRemoteDescription(new RTCSessionDescription(peerData.answer));
      
      // Add ICE candidates
      if (peerData.candidates) {
        for (const candidate of peerData.candidates) {
          try {
            await state.connection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.error('Error adding ICE candidate:', e);
          }
        }
      }
    }
  }
}

// Handle incoming connection
async function handleIncomingConnection(fromCode, data) {
  try {
    updateConnectionStatus('connecting');
    state.peerCode = fromCode;
    document.getElementById('peerCodeInput').value = fromCode;
    
    // Create peer connection
    state.connection = new RTCPeerConnection(config);
    
    // Setup ICE candidate handling
    state.connection.onicecandidate = (event) => {
      if (event.candidate) {
        if (!state.signalingBoard[state.myCode]) {
          state.signalingBoard[state.myCode] = {};
        }
        if (!state.signalingBoard[state.myCode].candidates) {
          state.signalingBoard[state.myCode].candidates = [];
        }
        state.signalingBoard[state.myCode].candidates.push(event.candidate);
      }
    };
    
    // Setup connection state change
    state.connection.onconnectionstatechange = () => {
      console.log('Connection state:', state.connection.connectionState);
      if (state.connection.connectionState === 'connected') {
        updateConnectionStatus('connected');
        showToast('Connected to peer!', 'success');
      } else if (state.connection.connectionState === 'disconnected' || 
                 state.connection.connectionState === 'failed') {
        updateConnectionStatus('disconnected');
        showToast('Connection lost', 'error');
      }
    };
    
    // Setup data channel listener
    state.connection.ondatachannel = (event) => {
      state.dataChannel = event.channel;
      setupDataChannel(state.dataChannel);
    };
    
    // Set remote description
    await state.connection.setRemoteDescription(new RTCSessionDescription(data.offer));
    
    // Create answer
    const answer = await state.connection.createAnswer();
    await state.connection.setLocalDescription(answer);
    
    // Store answer in signaling board
    state.signalingBoard[state.myCode] = {
      answer: answer,
      target: fromCode,
      candidates: []
    };
    
    // Add ICE candidates from offer
    if (data.candidates) {
      for (const candidate of data.candidates) {
        try {
          await state.connection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error adding ICE candidate:', e);
        }
      }
    }
    
  } catch (error) {
    console.error('Error handling incoming connection:', error);
    updateConnectionStatus('failed');
    showToast('Failed to accept connection', 'error');
  }
}

// Setup data channel
function setupDataChannel(channel) {
  channel.onopen = () => {
    console.log('Data channel opened');
    updateConnectionStatus('connected');
  };
  
  channel.onclose = () => {
    console.log('Data channel closed');
    updateConnectionStatus('disconnected');
  };
  
  channel.onmessage = (event) => {
    handleIncomingMessage(event.data);
  };
}

// Handle incoming message
function handleIncomingMessage(data) {
  try {
    const message = JSON.parse(data);
    
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
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
}

// Send message
function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  
  if (!text || state.connectionState !== 'connected' || !state.dataChannel) {
    return;
  }
  
  const messageId = Date.now().toString();
  const message = {
    id: messageId,
    type: 'text',
    text: text,
    timestamp: new Date().toISOString()
  };
  
  // Send via data channel
  try {
    state.dataChannel.send(JSON.stringify(message));
    
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
    console.error('Error sending message:', error);
    showToast('Failed to send message', 'error');
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

// Send typing indicator
function sendTypingIndicator(isTyping) {
  if (state.dataChannel && state.dataChannel.readyState === 'open') {
    try {
      state.dataChannel.send(JSON.stringify({
        type: 'typing',
        isTyping: isTyping
      }));
    } catch (error) {
      console.error('Error sending typing indicator:', error);
    }
  }
}

// Show typing indicator
function showTypingIndicator(isTyping) {
  const indicator = document.getElementById('typingIndicator');
  indicator.style.display = isTyping ? 'flex' : 'none';
}

// Send read receipt
function sendReadReceipt(messageId) {
  if (state.dataChannel && state.dataChannel.readyState === 'open') {
    try {
      state.dataChannel.send(JSON.stringify({
        type: 'read',
        messageId: messageId
      }));
    } catch (error) {
      console.error('Error sending read receipt:', error);
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

// React to message
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
  
  // Check file size (5MB limit)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    showToast('File too large (max 5MB)', 'error');
    return;
  }
  
  if (state.connectionState !== 'connected') {
    showToast('Not connected to peer', 'error');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (event) => {
    const fileData = event.target.result;
    
    const fileMessage = {
      type: 'file',
      fileName: file.name,
      fileSize: file.size,
      fileData: fileData,
      timestamp: new Date().toISOString()
    };
    
    try {
      state.dataChannel.send(JSON.stringify(fileMessage));
      
      // Add to local messages
      addFileMessage({
        fileName: file.name,
        fileSize: file.size,
        fileData: fileData,
        type: 'sent',
        timestamp: new Date()
      });
      
      showToast('File sent!', 'success');
    } catch (error) {
      console.error('Error sending file:', error);
      showToast('Failed to send file', 'error');
    }
  };
  
  reader.readAsDataURL(file);
  
  // Reset input
  e.target.value = '';
}

// Download file
function downloadFile(fileName, fileData) {
  const link = document.createElement('a');
  link.href = fileData;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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

// Select emoji
function selectEmoji(emoji) {
  if (state.reactionTarget) {
    // Send as reaction
    if (state.dataChannel && state.dataChannel.readyState === 'open') {
      try {
        state.dataChannel.send(JSON.stringify({
          type: 'reaction',
          messageId: state.reactionTarget,
          emoji: emoji
        }));
        addReaction(state.reactionTarget, emoji);
      } catch (error) {
        console.error('Error sending reaction:', error);
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
    connecting: 'Connecting...',
    connected: 'Connected',
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

// Show toast notification
function showToast(message, type = 'success') {
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
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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