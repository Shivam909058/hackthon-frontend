// --- src/app.js ---
import { Conversation } from '@11labs/client';

const API_URL = process.env.REACT_APP_API_URL || 'https://hackthon-backend-zeta.vercel.app';

let conversation = null;
let animationActive = false;


document.addEventListener('DOMContentLoaded', function() {
    const scrollBtn = document.getElementById('scrollTopBtn');
    
    scrollBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
    
    
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            scrollBtn.style.opacity = '1';
        } else {
            scrollBtn.style.opacity = '0';
        }
    });
    
    
    document.getElementById('startButton').addEventListener('click', startConversation);
    document.getElementById('endButton').addEventListener('click', endConversation);
    
    
    pauseVisualizer();
});

async function requestMicrophonePermission() {
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        return true;
    } catch (error) {
        console.error('Microphone permission denied:', error);
        return false;
    }
}

async function getSignedUrl() {
    try {
        const response = await fetch(`${API_URL}/api/signed-url`);
        if (!response.ok) throw new Error('Failed to get signed URL');
        const data = await response.json();
        return data.signedUrl;
    } catch (error) {
        console.error('Error getting signed URL:', error);
        throw error;
    }
}

function updateConnectionStatus(isConnected) {
    const statusElement = document.getElementById('connectionStatus');
    
    if (isConnected) {
        statusElement.innerHTML = '<i class="fas fa-plug"></i> Connected';
        statusElement.classList.remove('disconnected');
        statusElement.classList.add('connected');
    } else {
        statusElement.innerHTML = '<i class="fas fa-plug"></i> Disconnected';
        statusElement.classList.remove('connected');
        statusElement.classList.add('disconnected');
    }
}

function updateSpeakingStatus(mode) {
    const statusElement = document.getElementById('speakingStatus');
    const isSpeaking = mode.mode === 'speaking';
    
    if (isSpeaking) {
        statusElement.innerHTML = '<i class="fas fa-volume-high"></i> Agent Speaking';
        statusElement.classList.remove('silent');
        statusElement.classList.add('speaking');
        activateVisualizer();
    } else {
        statusElement.innerHTML = '<i class="fas fa-volume-off"></i> Agent Silent';
        statusElement.classList.remove('speaking');
        statusElement.classList.add('silent');
        pauseVisualizer();
    }
}

function activateVisualizer() {
    const bars = document.querySelectorAll('.visualizer .bar');
    animationActive = true;
    
    bars.forEach(bar => {
        bar.style.animationPlayState = 'running';
    });
}

function pauseVisualizer() {
    const bars = document.querySelectorAll('.visualizer .bar');
    animationActive = false;
    
    bars.forEach(bar => {
        bar.style.animationPlayState = 'paused';
        bar.style.height = '15px';
        bar.style.transform = 'scaleY(1)';
    });
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    const notificationMessage = notification.querySelector('.notification-message');
    const notificationIcon = notification.querySelector('.notification-icon');
    
    // Set icon based on type
    if (type === 'success') {
        notificationIcon.className = 'notification-icon fas fa-check-circle';
    } else if (type === 'error') {
        notificationIcon.className = 'notification-icon fas fa-exclamation-circle';
    } else {
        notificationIcon.className = 'notification-icon fas fa-info-circle';
    }
    
    // Set message and show notification
    notificationMessage.textContent = message;
    notification.className = `notification ${type} show`;
    
    // Hide notification after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
    }, 5000);
}

async function startConversation() {
    const startButton = document.getElementById('startButton');
    const endButton = document.getElementById('endButton');
    
    // Change button to loading state
    startButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Connecting...</span>';
    startButton.disabled = true;
    
    try {
        const hasPermission = await requestMicrophonePermission();
        if (!hasPermission) {
            showNotification('Microphone permission is required for the conversation.', 'error');
            startButton.innerHTML = '<i class="fas fa-microphone"></i><span>Start Conversation</span>';
            startButton.disabled = false;
            return;
        }

        const signedUrl = await getSignedUrl();
        
        conversation = await Conversation.startSession({
            signedUrl: signedUrl,
            onConnect: () => {
                updateConnectionStatus(true);
                startButton.disabled = true;
                endButton.disabled = false;
                startButton.innerHTML = '<i class="fas fa-microphone"></i><span>Start Conversation</span>';
                showNotification('Connected successfully! You can start speaking now.', 'success');
            },
            onDisconnect: () => {
                updateConnectionStatus(false);
                startButton.disabled = false;
                endButton.disabled = true;
                updateSpeakingStatus({ mode: 'listening' });
            },
            onError: (error) => {
                console.error('Conversation error:', error);
                showNotification('An error occurred during the conversation.', 'error');
                startButton.disabled = false;
                startButton.innerHTML = '<i class="fas fa-microphone"></i><span>Start Conversation</span>';
            },
            onModeChange: (mode) => {
                updateSpeakingStatus(mode);
            }
        });
    } catch (error) {
        console.error('Error starting conversation:', error);
        showNotification('Failed to start conversation. Please try again.', 'error');
        startButton.disabled = false;
        startButton.innerHTML = '<i class="fas fa-microphone"></i><span>Start Conversation</span>';
    }
}

async function endConversation() {
    const endButton = document.getElementById('endButton');
    endButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span>Ending...</span>';
    endButton.disabled = true;
    
    try {
        if (conversation) {
            await conversation.endSession();
            conversation = null;
        }
        
        endButton.innerHTML = '<i class="fas fa-stop-circle"></i><span>End Conversation</span>';
        showNotification('Conversation ended successfully.', 'info');
    } catch (error) {
        console.error('Error ending conversation:', error);
        endButton.innerHTML = '<i class="fas fa-stop-circle"></i><span>End Conversation</span>';
        endButton.disabled = false;
        showNotification('Error ending conversation.', 'error');
    }
}

window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
    showNotification('An unexpected error occurred.', 'error');
});