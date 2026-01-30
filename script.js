document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in
    if (!sessionId) {
        const loginModal = document.getElementById('loginModal');
        loginModal.classList.add('show');
        return;
    } else {
        document.getElementById('loginModal').classList.remove('show');
        document.getElementById('app').style.display = 'block';
        loadUserData();
    }

    const fridgeDoor = document.getElementById('fridgeDoor');
    const doorHandle = document.getElementById('doorHandle');
    const magnetSurface = document.getElementById('magnetSurface');
    const magnetOverlay = document.getElementById('magnetOverlay');
    const colorPicker = document.getElementById('colorPicker');
    const root = document.documentElement;
    const fileInput = document.getElementById('fileInput');

    let draggedMagnet = null;
    let offset = { x: 0, y: 0 };
    let isDoorOpen = false;
    window.isDoorOpenGlobal = false; // Expose for 3D engine

    // Sync magnet overlay with 3D door state
    function syncMagnetOverlay() {
        if (magnetOverlay) {
            if (window.isDoorOpenGlobal) {
                magnetOverlay.classList.add('door-open');
            } else {
                magnetOverlay.classList.remove('door-open');
            }
        }
    }

    // Poll for 3D door state changes
    setInterval(() => {
        if (isDoorOpen !== window.isDoorOpenGlobal) {
            isDoorOpen = window.isDoorOpenGlobal;
            syncMagnetOverlay();
        }
    }, 100);

    // --- Interaction: Open/Close Drawer ---
    if (doorHandle) {
        doorHandle.addEventListener('click', (e) => {
            e.stopPropagation(); 
            toggleDoor();
        });
    }

    // Allow clicking the magnet overlay to open the fridge
    if (magnetOverlay) {
        magnetOverlay.addEventListener('dblclick', (e) => {
            // Double-click empty space to toggle door
            if (e.target === magnetOverlay || e.target.classList.contains('instructions') || e.target.closest('.instructions')) {
                window.isDoorOpenGlobal = !window.isDoorOpenGlobal;
                isDoorOpen = window.isDoorOpenGlobal;
                syncMagnetOverlay();
            }
        });
    }

    function toggleDoor() {
        isDoorOpen = !isDoorOpen;
        window.isDoorOpenGlobal = isDoorOpen; // Sync with 3D
        syncMagnetOverlay(); // Sync overlay visibility
        
        const hingeSide = fridgeDoor ? (fridgeDoor.style.transformOrigin.includes('right') ? 'right' : 'left') : 'left';
        
        // CSS Fallback (kept for reference or if 3D fails loading)
        if (fridgeDoor) {
            if (isDoorOpen) {
                fridgeDoor.classList.add('open');
            } else {
                fridgeDoor.classList.remove('open');
            }
        }
    }

    // --- Interaction: Add Magnets (Click empty space on overlay) ---
    if (magnetSurface) {
        magnetSurface.addEventListener('click', (e) => {
            if ((e.target === magnetSurface || e.target.closest('.instructions')) && !isDoorOpen) {
                fileInput.click();
            }
        });
    }

    // --- Interaction: Click Outside to Close ---
    document.addEventListener('click', (e) => {
        if (isDoorOpen) {
            // Check if click is outside the fridge area and magnet overlay
            const fridge = document.querySelector('.fridge-container');
            const handle = document.getElementById('doorHandle');
            const threeContainer = document.getElementById('three-container');
            const overlay = document.getElementById('magnetOverlay');
            
            // Don't close if clicking on 3D fridge or magnet overlay
            if (threeContainer && threeContainer.contains(e.target)) return;
            if (overlay && overlay.contains(e.target)) return;
            if (fridge && fridge.contains(e.target)) return;
            if (handle && handle.contains(e.target)) return;
            
            toggleDoor();
        }
    });

    // --- Interaction: Drag & Drop Files ---
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        if (isDoorOpen) return;

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFiles(files, e.clientX, e.clientY);
        }
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        fileInput.value = '';
    });

    async function handleFiles(files, dropX, dropY) {
        for (const file of files) {
            if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;

            // Only allow images for 3D magnets (video not supported as textures)
            if (file.type.startsWith('video/')) {
                alert('Only images are supported for 3D magnets');
                continue;
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('caption', file.name);
            formData.append('positionX', dropX || (Math.random() * 200 - 100));
            formData.append('positionY', dropY || (Math.random() * 300 - 150));
            formData.append('rotation', Math.random() * 30 - 15);

            try {
                const response = await fetch(`${API_URL}/magnets`, {
                    method: 'POST',
                    headers: { 'X-Session-Id': sessionId },
                    body: formData
                });

                const data = await response.json();
                
                if (response.ok) {
                    const mediaUrl = `http://localhost:3000/uploads/${data.filePath}`;
                    // Use 3D magnet system
                    if (window.add3DMagnet) {
                        window.add3DMagnet(mediaUrl, data.id, data.positionX, data.positionY, data.rotation, data.caption);
                    }
                } else {
                    alert(data.error);
                }
            } catch (err) {
                console.error('Error uploading:', err);
                alert('Failed to upload. Make sure backend is running.');
            }
        }
    }

    function createMagnet(mediaSrc, text, x, y, rotation, fileType = 'image', magnetId = null) {
        // Get magnetSurface fresh each time (handles async loading)
        const surface = document.getElementById('magnetSurface');
        if (!surface) {
            console.error('Magnet surface not found');
            return;
        }
        
        const magnet = document.createElement('div');
        magnet.classList.add('magnet');
        if (fileType === 'video') {
            magnet.classList.add('video-magnet');
        }
        
        rotation = rotation || (Math.random() * 30 - 15);
        magnet.style.setProperty('--rotation', `${rotation}deg`);
        magnet.dataset.magnetId = magnetId;

        // Media element
        if (fileType === 'video') {
            const video = document.createElement('video');
            video.src = mediaSrc;
            video.loop = true;
            video.muted = true;
            video.setAttribute('playsinline', '');
            magnet.appendChild(video);

            // Play on hover
            magnet.addEventListener('mouseenter', () => {
                video.play();
            });
            magnet.addEventListener('mouseleave', () => {
                video.pause();
                video.currentTime = 0;
            });
        } else {
            const img = document.createElement('img');
            img.src = mediaSrc;
            img.draggable = false;
            magnet.appendChild(img);
        }

        // Text (Hidden until hover)
        const caption = document.createElement('div');
        caption.classList.add('magnet-text');
        caption.innerText = text;
        magnet.appendChild(caption);

        surface.appendChild(magnet);

        // Position - use relative positioning within surface
        const rect = surface.getBoundingClientRect();
        let posX = x !== null && x !== undefined ? parseFloat(x) : Math.random() * (rect.width - 100);
        let posY = y !== null && y !== undefined ? parseFloat(y) : Math.random() * (rect.height - 100);
        
        // Clamp to bounds
        posX = Math.max(0, Math.min(posX, rect.width - 80));
        posY = Math.max(0, Math.min(posY, rect.height - 80));

        magnet.style.left = `${posX}px`;
        magnet.style.top = `${posY}px`;

        // Attach dragging logic
        magnet.addEventListener('mousedown', startDrag);
        
        // Delete on double-click
        magnet.addEventListener('dblclick', async (e) => {
            e.stopPropagation();
            if (!magnetId) return;
            
            if (confirm('Delete this magnet?')) {
                try {
                    const response = await fetch(`${API_URL}/magnets/${magnetId}`, {
                        method: 'DELETE',
                        headers: { 'X-Session-Id': sessionId }
                    });
                    
                    if (response.ok) {
                        magnet.remove();
                    }
                } catch (err) {
                    console.error('Delete error:', err);
                }
            }
        });
        
        return magnet;
    }
    
    // Expose createMagnet globally for loadUserData
    window.createMagnet = createMagnet;

    // --- Interaction: Move Magnets ---
    function startDrag(e) {
        if (isDoorOpen) return;
        draggedMagnet = e.currentTarget;
        
        offset.x = e.clientX - draggedMagnet.offsetLeft;
        offset.y = e.clientY - draggedMagnet.offsetTop;

        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
    }

    function drag(e) {
        if (!draggedMagnet) return;
        e.preventDefault();

        const x = e.clientX - offset.x;
        const y = e.clientY - offset.y;

        draggedMagnet.style.left = `${x}px`;
        draggedMagnet.style.top = `${y}px`;
    }

    async function stopDrag() {
        if (draggedMagnet && draggedMagnet.dataset.magnetId) {
            const magnetId = draggedMagnet.dataset.magnetId;
            const x = parseFloat(draggedMagnet.style.left);
            const y = parseFloat(draggedMagnet.style.top);
            const rotation = parseFloat(draggedMagnet.style.getPropertyValue('--rotation'));
            
            try {
                await fetch(`${API_URL}/magnets/${magnetId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Session-Id': sessionId
                    },
                    body: JSON.stringify({
                        positionX: x,
                        positionY: y,
                        rotation: rotation,
                        caption: draggedMagnet.querySelector('.magnet-text').textContent
                    })
                });
            } catch (err) {
                console.error('Update error:', err);
            }
        }
        
        draggedMagnet = null;
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDrag);
    }

    // --- Settings: Color Picker ---
    colorPicker.addEventListener('input', async (e) => {
        const color = e.target.value;
        root.style.setProperty('--fridge-color', color);
        
        try {
            await fetch(`${API_URL}/config`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Id': sessionId
                },
                body: JSON.stringify({ fridgeColor: color, handlePosition: 'right' })
            });
        } catch (err) {
            console.error('Config update error:', err);
        }
    });

    // --- Settings: Handle Position ---
    document.getElementById('handlePos').addEventListener('change', async (e) => {
        const pos = e.target.value;
        const handle = document.querySelector('.handle');

        if (pos === 'left') {
            handle.style.left = '15px';
            handle.style.right = 'auto';
            fridgeDoor.style.transformOrigin = 'right center';
        } else {
            handle.style.right = '15px';
            handle.style.left = 'auto';
            fridgeDoor.style.transformOrigin = 'left center';
        }
        
        try {
            await fetch(`${API_URL}/config`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Id': sessionId
                },
                body: JSON.stringify({ fridgeColor: colorPicker.value, handlePosition: pos })
            });
        } catch (err) {
            console.error('Config update error:', err);
        }
    });

    // --- Settings: Wall Theme ---
    document.getElementById('wallTheme').addEventListener('change', (e) => {
        const wallLayer = document.getElementById('wallLayer');
        wallLayer.className = 'wall-layer ' + e.target.value;
        localStorage.setItem('wallTheme', e.target.value);
    });

    // Load saved wall theme
    const savedWallTheme = localStorage.getItem('wallTheme') || 'subway-tile';
    document.getElementById('wallTheme').value = savedWallTheme;
    document.getElementById('wallLayer').className = 'wall-layer ' + savedWallTheme;

    // --- Settings: Visual Style Toggle ---
    document.getElementById('visualStyle').addEventListener('change', (e) => {
        document.body.dataset.theme = e.target.value;
        localStorage.setItem('visualStyle', e.target.value);
    });

    // Load saved visual style
    const savedVisualStyle = localStorage.getItem('visualStyle') || 'realistic';
    document.getElementById('visualStyle').value = savedVisualStyle;
    document.body.dataset.theme = savedVisualStyle;

    // --- Settings: Outdoor Scene Selector ---
    document.getElementById('outdoorScene').addEventListener('change', (e) => {
        const outdoorSceneEl = document.querySelector('.outdoor-scene');
        outdoorSceneEl.className = 'outdoor-scene ' + e.target.value;
        localStorage.setItem('outdoorScene', e.target.value);
    });

    // Load saved outdoor scene
    const savedOutdoorScene = localStorage.getItem('outdoorScene') || 'city';
    document.getElementById('outdoorScene').value = savedOutdoorScene;
    document.querySelector('.outdoor-scene').className = 'outdoor-scene ' + savedOutdoorScene;

    // --- Settings: Weather Zipcode ---
    const zipcodeInput = document.getElementById('zipcode');
    const savedZipcode = localStorage.getItem('zipcode');
    if (savedZipcode) {
        zipcodeInput.value = savedZipcode;
    }

    zipcodeInput.addEventListener('change', (e) => {
        localStorage.setItem('zipcode', e.target.value);
        updateWeather();
    });

    // --- Settings: Ambient Lighting Intensity ---
    document.getElementById('ambientIntensity').addEventListener('input', (e) => {
        const intensity = e.target.value / 100;
        document.getElementById('lightingLayer').style.opacity = intensity;
        localStorage.setItem('ambientIntensity', e.target.value);
    });

    // Load saved ambient intensity
    const savedIntensity = localStorage.getItem('ambientIntensity') || 60;
    document.getElementById('ambientIntensity').value = savedIntensity;
    document.getElementById('lightingLayer').style.opacity = savedIntensity / 100;

    // Initialize atmosphere
    updateDayNightCycle();
    updateWeather();

    // Update atmosphere every 5 minutes
    setInterval(updateDayNightCycle, 300000);
    // Update weather every 30 minutes
    setInterval(updateWeather, 1800000);

    // Auto-open mail toggle
    const autoOpenCheckbox = document.getElementById('autoOpenMail');
    const savedAutoOpen = localStorage.getItem('autoOpenMail') === 'true';
    autoOpenCheckbox.checked = savedAutoOpen;

    autoOpenCheckbox.addEventListener('change', (e) => {
        localStorage.setItem('autoOpenMail', e.target.checked);
    });

    // Load mail stack
    loadMailStack();
    // Refresh mail stack every 2 minutes
    setInterval(loadMailStack, 120000);

});

// === ATMOSPHERE & WEATHER FUNCTIONS ===

function updateDayNightCycle() {
    const hour = new Date().getHours();
    let timeOfDay;

    if (hour >= 6 && hour < 18) {
        timeOfDay = 'daytime';
    } else if (hour >= 18 && hour < 21) {
        timeOfDay = 'evening';
    } else {
        timeOfDay = 'night';
    }

    const kitchenScene = document.querySelector('.kitchen-scene');
    const skyGradient = document.getElementById('skyGradient');
    const windowLight = document.getElementById('windowLight');

    kitchenScene.className = 'kitchen-scene ' + timeOfDay;
    skyGradient.className = 'sky-gradient ' + timeOfDay;
    windowLight.className = 'window-light ' + timeOfDay;
}

async function updateWeather() {
    const zipcode = localStorage.getItem('zipcode');
    
    if (!zipcode || zipcode.length !== 5) {
        // Use random weather if no zipcode
        setRandomWeather();
        return;
    }

    try {
        // Using Open-Meteo free API (no key required)
        // First get coordinates from zipcode using a geocoding service
        const geoResponse = await fetch(`https://api.zippopotam.us/us/${zipcode}`);
        
        if (!geoResponse.ok) {
            setRandomWeather();
            return;
        }

        const geoData = await geoResponse.json();
        const lat = geoData.places[0].latitude;
        const lon = geoData.places[0].longitude;

        // Get weather from Open-Meteo
        const weatherResponse = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit`
        );

        if (!weatherResponse.ok) {
            setRandomWeather();
            return;
        }

        const weatherData = await weatherResponse.json();
        const current = weatherData.current_weather;

        // Update UI
        document.querySelector('.temperature').textContent = Math.round(current.temperature) + '°F';
        
        // Map weather codes to conditions
        const weatherCode = current.weathercode;
        let condition = 'Clear';
        let weatherClass = 'sunny';

        if (weatherCode === 0) {
            condition = 'Clear';
            weatherClass = 'sunny';
        } else if (weatherCode >= 1 && weatherCode <= 3) {
            condition = 'Cloudy';
            weatherClass = 'cloudy';
        } else if (weatherCode >= 51 && weatherCode <= 67) {
            condition = 'Rainy';
            weatherClass = 'rain';
        } else if (weatherCode >= 71 && weatherCode <= 77) {
            condition = 'Snowy';
            weatherClass = 'snow';
        } else if (weatherCode >= 80 && weatherCode <= 99) {
            condition = 'Stormy';
            weatherClass = 'rain';
        } else {
            condition = 'Partly Cloudy';
            weatherClass = 'cloudy';
        }

        document.querySelector('.condition').textContent = condition;
        
        // Update layered weather system
        applyWeatherLayers(weatherClass);

    } catch (err) {
        console.error('Weather fetch error:', err);
        setRandomWeather();
    }
}

function applyWeatherLayers(weatherType) {
    // Clear all weather layers
    document.getElementById('weatherRain').className = 'weather-layer';
    document.getElementById('weatherSnow').className = 'weather-layer';
    document.getElementById('weatherSunny').className = 'weather-layer';
    document.getElementById('weatherCloudy').className = 'weather-layer';
    // Wind is always present but animates occasionally
    document.getElementById('weatherWind').className = 'weather-layer wind';
    
    // Apply the active weather
    switch(weatherType) {
        case 'rain':
            document.getElementById('weatherRain').className = 'weather-layer rain';
            break;
        case 'snow':
            document.getElementById('weatherSnow').className = 'weather-layer snow';
            break;
        case 'sunny':
            document.getElementById('weatherSunny').className = 'weather-layer sunny';
            break;
        case 'cloudy':
            document.getElementById('weatherCloudy').className = 'weather-layer cloudy';
            break;
    }
}

function setRandomWeather() {
    const conditions = [
        { name: 'Sunny', class: 'sunny', temp: 75 },
        { name: 'Cloudy', class: 'cloudy', temp: 65 },
        { name: 'Rainy', class: 'rain', temp: 55 },
        { name: 'Snowy', class: 'snow', temp: 32 },
        { name: 'Clear', class: 'sunny', temp: 70 }
    ];

    const random = conditions[Math.floor(Math.random() * conditions.length)];
    
    document.querySelector('.temperature').textContent = random.temp + '°F';
    document.querySelector('.condition').textContent = random.name;
    applyWeatherLayers(random.class);
}

// === AUTH FUNCTIONS ===
async function login() {
    const username = document.getElementById('username').value;
    const pin = document.getElementById('pin').value;
    
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, pin })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            sessionId = data.sessionId;
            localStorage.setItem('sessionId', sessionId);
            localStorage.setItem('username', data.username); // Store username
            document.getElementById('loginModal').classList.remove('show');
            document.getElementById('app').style.display = 'block';
            window.location.reload();
        } else {
            document.getElementById('loginError').textContent = data.error;
        }
    } catch (err) {
        document.getElementById('loginError').textContent = 'Connection error. Make sure backend is running on port 3000.';
    }
}

async function register() {
    const username = document.getElementById('username').value;
    const pin = document.getElementById('pin').value;
    
    if (!username || !pin) {
        document.getElementById('loginError').textContent = 'Please enter username and PIN';
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, pin })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            document.getElementById('loginError').textContent = 'Registered! Now login.';
            document.getElementById('loginError').style.color = 'green';
        } else {
            document.getElementById('loginError').textContent = data.error;
        }
    } catch (err) {
        document.getElementById('loginError').textContent = 'Connection error';
    }
}

// === DATA LOADING ===
async function loadUserData() {
    try {
        const response = await fetch(`${API_URL}/magnets`, {
            headers: { 'X-Session-Id': sessionId }
        });
        
        if (!response.ok) {
            localStorage.removeItem('sessionId');
            location.reload();
            return;
        }
        
        const magnets = await response.json();
        console.log('Loading magnets from database:', magnets.length);
        
        // Use 3D magnet system if available
        if (window.load3DMagnetsFromData) {
            window.load3DMagnetsFromData(magnets);
        } else {
            // Retry after a short delay (3D engine might not be ready)
            setTimeout(() => {
                if (window.load3DMagnetsFromData) {
                    window.load3DMagnetsFromData(magnets);
                }
            }, 500);
        }

        // Load mail items
        loadMail();
        loadMailStack();
    } catch (err) {
        console.error('Error loading magnets:', err);
    }
}

// === MAIL & CIRCLES FUNCTIONS ===

async function loadMail() {
    try {
        const response = await fetch(`${API_URL}/mail`, {
            headers: { 'X-Session-Id': sessionId }
        });

        if (!response.ok) {
            document.getElementById('mailList').innerHTML = '<p class="loading">No mail</p>';
            return;
        }

        const mailItems = await response.json();
        const mailList = document.getElementById('mailList');

        if (mailItems.length === 0) {
            mailList.innerHTML = '<p class="loading">No mail yet. Join a circle to receive updates!</p>';
            return;
        }

        mailList.innerHTML = mailItems.map(mail => `
            <div class="mail-item">
                <div class="mail-item-header">
                    <span class="mail-from">${mail.from_username}</span>
                    <span class="mail-circle">${mail.circle_name}</span>
                </div>
                ${mail.subject ? `<div class="mail-subject">${mail.subject}</div>` : ''}
                ${mail.content ? `<div style="font-size: 0.8rem; color: #666;">${mail.content.substring(0, 50)}${mail.content.length > 50 ? '...' : ''}</div>` : ''}
                <div class="mail-actions">
                    ${mail.media_path && !mail.is_converted_to_magnet ? 
                        `<button class="btn-convert" onclick="convertMailToMagnet(${mail.id})">📌 Add to Fridge</button>` :
                        mail.is_converted_to_magnet ? 
                        `<span style="font-size: 0.75rem; color: #888;">✓ On fridge</span>` :
                        `<span style="font-size: 0.75rem; color: #888;">Text only</span>`
                    }
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading mail:', err);
        document.getElementById('mailList').innerHTML = '<p class="loading">Error loading mail</p>';
    }
}

async function convertMailToMagnet(mailId) {
    try {
        const response = await fetch(`${API_URL}/mail/${mailId}/convert`, {
            method: 'POST',
            headers: { 'X-Session-Id': sessionId }
        });

        const data = await response.json();

        if (response.ok) {
            const mediaUrl = `http://localhost:3000/uploads/${data.filePath}`;
            
            // Use 3D magnet system
            if (window.add3DMagnet) {
                window.add3DMagnet(mediaUrl, data.magnetId, Math.random() * 100 - 50, Math.random() * 150 - 75, Math.random() * 20 - 10, data.caption);
            }
            
            // Reload mail list to update UI
            loadMail();
            loadMailStack();
            
            console.log('📌 Added to fridge as 3D magnet!');
        } else {
            alert(data.error || 'Failed to add to fridge');
        }
    } catch (err) {
        console.error('Error converting mail:', err);
        alert('Failed to add to fridge');
    }
}

function showCircleModal() {
    alert('Circle management UI coming soon! Use API endpoints:\n\nGET /api/circles - View your circles\nPOST /api/circles - Create new circle\nPOST /api/circles/:id/members - Invite users');
}

// === MAIL STACK FUNCTIONS ===

async function loadMailStack() {
    try {
        const response = await fetch(`${API_URL}/mail`, {
            headers: { 'X-Session-Id': sessionId }
        });

        if (!response.ok) return;

        const mailItems = await response.json();
        const mailStackList = document.getElementById('mailStackList');
        const mailCount = document.getElementById('mailCount');

        // Filter for unread mail with media
        const unreadMail = mailItems.filter(m => m.media_path && !m.is_converted_to_magnet);
        
        mailCount.textContent = unreadMail.length;

        if (unreadMail.length === 0) {
            mailStackList.innerHTML = '<div class="mail-stack-empty">No mail</div>';
        } else {
            // Take top 3 items
            const topMail = unreadMail.slice(0, 3);
            
            mailStackList.innerHTML = topMail.map((mail, index) => {
                const zIndex = 10 - index;
                // Random rotation -3 to 3 deg
                const rotation = (Math.random() * 6 - 3).toFixed(1);
                // Random offset -2 to 2 px
                const offsetX = (Math.random() * 4 - 2).toFixed(1);
                const offsetY = (Math.random() * 4 - 2).toFixed(1);

                return `
                <div class="mail-stack-item unread" 
                     style="z-index: ${zIndex}; transform: rotate(${rotation}deg) translate(${offsetX}px, ${offsetY}px);"
                     onclick="openMailFromStack(${mail.id})">
                    <div class="envelope-seal"></div>
                    <div class="mail-content-wrapper">
                        <div class="mail-stack-from">${mail.from_username}</div>
                        <div class="mail-stack-preview">${mail.subject || 'New Message'}</div>
                    </div>
                </div>
                `;
            }).join('');
        }

        // Auto-open fridge if enabled and has new mail
        const autoOpen = localStorage.getItem('autoOpenMail') === 'true';
        if (autoOpen && unreadMail.length > 0) {
            // Auto-convert new mail with media to magnets
            for (const mail of unreadMail) {
                if (mail.media_path && !mail.is_converted_to_magnet) {
                    console.log('Auto-converting mail to magnet:', mail.id);
                    await convertMailToMagnet(mail.id);
                }
            }
        }
    } catch (err) {
        console.error('Error loading mail stack:', err);
    }
}

function openMailFromStack(mailId) {
    // Open the fridge if closed
    if (!isDoorOpen) {
        toggleDoor();
    }
    
    // Scroll to mail panel
    setTimeout(() => {
        const mailPanel = document.querySelector('.mail-panel');
        if (mailPanel) {
            mailPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        
        // Highlight the mail item in the fridge
        const mailItems = document.querySelectorAll('.mail-item');
        mailItems.forEach(item => {
            if (item.innerHTML.includes(`convertMailToMagnet(${mailId})`)) {
                item.style.background = '#FFFACD';
                item.style.border = '2px solid #FFD700';
                setTimeout(() => {
                    item.style.background = '';
                    item.style.border = '';
                }, 2000);
            }
        });
    }, 700);
}

