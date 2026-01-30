import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';

let camera, scene, renderer, cssRenderer, controls;
let composer, outlinePass;
let fridgeGroup, doorPivot, doorMesh, interiorGroup;
let isDoorOpen = false;
let doorTargetRotation = 0;
let settingsPanels = [];
let magnetMeshes = []; // 3D magnet textures on door
let doorSurfacePlane; // Plane for magnet placement

// Config - Using real-world-ish scale (meters)
const FRIDGE_WIDTH = 3;
const FRIDGE_HEIGHT = 4.5;
const FRIDGE_DEPTH = 2.5;
const DOOR_THICKNESS = 0.15;

// Wait for DOM
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(init, 100);
});

function init() {
    const container = document.getElementById('three-container');
    if (!container) {
        console.error('Three container not found');
        return;
    }

    // Scene
    scene = new THREE.Scene();
    scene.background = null; // Transparent

    // Camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0.5, 8);

    // Renderer
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio); // Full resolution for crisp edges
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.NoToneMapping; // No tone mapping - show true colors
    container.appendChild(renderer.domElement);

    // Post-processing for outline effect
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    outlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
    outlinePass.edgeStrength = 5;
    outlinePass.edgeGlow = 1;
    outlinePass.edgeThickness = 2;
    outlinePass.pulsePeriod = 2;
    outlinePass.visibleEdgeColor.set(0x00FFFF);
    outlinePass.hiddenEdgeColor.set(0x004444);
    composer.addPass(outlinePass);

    // CSS3D Renderer for HTML elements inside fridge
    cssRenderer = new CSS3DRenderer();
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
    cssRenderer.domElement.style.position = 'absolute';
    cssRenderer.domElement.style.top = '0';
    cssRenderer.domElement.style.left = '0';
    cssRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(cssRenderer.domElement);

    // Controls - locked camera (no rotation)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableRotate = false; // No rotation - fixed view
    controls.enableZoom = false;   // No zoom
    controls.enablePan = false;    // No panning
    controls.enableDamping = false;
    controls.target.set(0, 0, 0);

    // Lighting
    setupLighting();

    // Create Fridge
    createFridge();

    // Floor shadow catcher
    const floorGeo = new THREE.PlaneGeometry(20, 20);
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.3 });
    window.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    window.floorMesh.rotation.x = -Math.PI / 2;
    window.floorMesh.position.y = -FRIDGE_HEIGHT / 2 - 0.01;
    window.floorMesh.receiveShadow = true;
    scene.add(window.floorMesh);

    // Events
    window.addEventListener('resize', onWindowResize);
    renderer.domElement.addEventListener('click', onCanvasClick);
    renderer.domElement.addEventListener('wheel', onCanvasWheel);
    renderer.domElement.addEventListener('mousemove', onCanvasMouseMove);
    renderer.domElement.addEventListener('mousedown', onCanvasMouseDown);
    renderer.domElement.addEventListener('mouseup', onCanvasMouseUp);
    renderer.domElement.addEventListener('mousemove', onCanvasMouseDrag);
    renderer.domElement.style.cursor = 'default';

    // File drop for adding magnets
    renderer.domElement.addEventListener('dragover', (e) => e.preventDefault());
    renderer.domElement.addEventListener('drop', handleFileDrop);
    
    // Load calendar countdowns
    loadCalendarCountdowns();
    
    // Create user flow UI
    createUserFlowUI();

    animate();
}

function setupLighting() {
    const ambient = new THREE.AmbientLight(0xFFF8E7, 0.5);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xFFFFFF, 1);
    keyLight.position.set(3, 5, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -5;
    keyLight.shadow.camera.right = 5;
    keyLight.shadow.camera.top = 5;
    keyLight.shadow.camera.bottom = -5;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x87CEEB, 0.3);
    fillLight.position.set(-3, 2, 2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xFFE4C4, 0.4);
    rimLight.position.set(0, 3, -3);
    scene.add(rimLight);
}

function createFridge() {
    fridgeGroup = new THREE.Group();
    scene.add(fridgeGroup);
    
    // Add calendar to left wall
    createWallCalendar();

    // Materials
    const fridgeMaterial = new THREE.MeshStandardMaterial({
        color: 0xE8E8E8,
        roughness: 0.6,
        metalness: 0.1,
    });

    const interiorMaterial = new THREE.MeshStandardMaterial({
        color: 0xFFFFFF,
        roughness: 0.9,
        metalness: 0,
    });

    const handleMaterial = new THREE.MeshStandardMaterial({
        color: 0xC0C0C0,
        roughness: 0.3,
        metalness: 0.6,
    });

    const gasketMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.9,
    });

    // === FRIDGE BODY (hollow box) ===
    // Back panel
    const backGeo = new THREE.BoxGeometry(FRIDGE_WIDTH, FRIDGE_HEIGHT, 0.1);
    const back = new THREE.Mesh(backGeo, fridgeMaterial);
    back.position.z = -FRIDGE_DEPTH / 2;
    back.castShadow = true;
    back.receiveShadow = true;
    fridgeGroup.add(back);

    // Left side
    const sideGeo = new THREE.BoxGeometry(0.1, FRIDGE_HEIGHT, FRIDGE_DEPTH);
    const leftSide = new THREE.Mesh(sideGeo, fridgeMaterial);
    leftSide.position.x = -FRIDGE_WIDTH / 2;
    leftSide.castShadow = true;
    fridgeGroup.add(leftSide);

    // Right side
    const rightSide = new THREE.Mesh(sideGeo, fridgeMaterial);
    rightSide.position.x = FRIDGE_WIDTH / 2;
    rightSide.castShadow = true;
    fridgeGroup.add(rightSide);

    // Top
    const topGeo = new THREE.BoxGeometry(FRIDGE_WIDTH, 0.1, FRIDGE_DEPTH);
    const top = new THREE.Mesh(topGeo, fridgeMaterial);
    top.position.y = FRIDGE_HEIGHT / 2;
    top.castShadow = true;
    fridgeGroup.add(top);

    // Bottom
    const bottom = new THREE.Mesh(topGeo, fridgeMaterial);
    bottom.position.y = -FRIDGE_HEIGHT / 2;
    bottom.receiveShadow = true;
    fridgeGroup.add(bottom);

    // === INTERIOR ===
    interiorGroup = new THREE.Group();
    interiorGroup.position.z = -FRIDGE_DEPTH / 4;
    fridgeGroup.add(interiorGroup);

    // Interior back wall
    const interiorBackGeo = new THREE.PlaneGeometry(FRIDGE_WIDTH - 0.2, FRIDGE_HEIGHT - 0.2);
    const interiorBack = new THREE.Mesh(interiorBackGeo, interiorMaterial);
    interiorBack.position.z = -FRIDGE_DEPTH / 2 + 0.1;
    interiorGroup.add(interiorBack);

    // Shelves with 3D settings items
    const shelfGeo = new THREE.BoxGeometry(FRIDGE_WIDTH - 0.3, 0.08, FRIDGE_DEPTH - 0.3);
    const shelfMat = new THREE.MeshStandardMaterial({
        color: 0xCCE5FF,
        roughness: 0.2,
        metalness: 0,
        transparent: true,
        opacity: 0.7,
    });

    const shelfPositions = [
        FRIDGE_HEIGHT / 2 - 0.8,
        FRIDGE_HEIGHT / 2 - 2.0,
        FRIDGE_HEIGHT / 2 - 3.2
    ];

    for (let i = 0; i < 3; i++) {
        const shelf = new THREE.Mesh(shelfGeo, shelfMat);
        shelf.position.y = shelfPositions[i];
        shelf.position.z = 0;
        interiorGroup.add(shelf);
    }

    // Add 3D settings objects on shelves
    createShelfItems();

    // Interior light
    const fridgeLight = new THREE.PointLight(0xFFFFFF, 0.5, 3);
    fridgeLight.position.set(0, FRIDGE_HEIGHT / 2 - 0.3, 0);
    interiorGroup.add(fridgeLight);

    // === DOOR PIVOT ===
    doorPivot = new THREE.Group();
    doorPivot.position.x = -FRIDGE_WIDTH / 2; // Left hinge
    doorPivot.position.z = FRIDGE_DEPTH / 2;
    fridgeGroup.add(doorPivot);

    // === DOOR ===
    const doorGeo = new THREE.BoxGeometry(FRIDGE_WIDTH, FRIDGE_HEIGHT, DOOR_THICKNESS);
    doorMesh = new THREE.Mesh(doorGeo, fridgeMaterial);
    doorMesh.position.x = FRIDGE_WIDTH / 2;
    doorMesh.position.z = DOOR_THICKNESS / 2;
    doorMesh.castShadow = true;
    doorMesh.receiveShadow = true;
    doorPivot.add(doorMesh);

    // Gasket
    const gasketGeo = new THREE.BoxGeometry(FRIDGE_WIDTH - 0.1, FRIDGE_HEIGHT - 0.1, 0.02);
    const gasket = new THREE.Mesh(gasketGeo, gasketMaterial);
    gasket.position.x = FRIDGE_WIDTH / 2;
    gasket.position.z = 0;
    doorPivot.add(gasket);

    // Door interior panel
    const doorInteriorGeo = new THREE.BoxGeometry(FRIDGE_WIDTH - 0.15, FRIDGE_HEIGHT - 0.15, 0.02);
    const doorInterior = new THREE.Mesh(doorInteriorGeo, interiorMaterial);
    doorInterior.position.x = FRIDGE_WIDTH / 2;
    doorInterior.position.z = 0.02;
    doorPivot.add(doorInterior);

    // === HANDLE ===
    const handleGeo = new THREE.CapsuleGeometry(0.06, 1.2, 8, 16);
    const handle = new THREE.Mesh(handleGeo, handleMaterial);
    handle.position.x = FRIDGE_WIDTH - 0.2;
    handle.position.z = DOOR_THICKNESS + 0.08;
    handle.castShadow = true;
    doorPivot.add(handle);

    handle.name = 'handle';
    doorMesh.name = 'door';

    // Store reference for hover effect (outline pass)
    window.fridgeHandle = handle;
    window.handleMaterial = handleMaterial;

    // === DOOR SURFACE FOR MAGNETS ===
    // Create an invisible plane on the door front for magnet placement
    const doorSurfaceGeo = new THREE.PlaneGeometry(FRIDGE_WIDTH - 0.2, FRIDGE_HEIGHT - 0.2);
    const doorSurfaceMat = new THREE.MeshBasicMaterial({ 
        visible: false,
        side: THREE.DoubleSide 
    });
    doorSurfacePlane = new THREE.Mesh(doorSurfaceGeo, doorSurfaceMat);
    doorSurfacePlane.position.x = FRIDGE_WIDTH / 2;
    doorSurfacePlane.position.z = DOOR_THICKNESS + 0.02;
    doorSurfacePlane.name = 'doorSurface';
    doorPivot.add(doorSurfacePlane);

    // === LOGO ===
    const logoCanvas = document.createElement('canvas');
    logoCanvas.width = 256;
    logoCanvas.height = 64;
    const logoTexture = new THREE.CanvasTexture(logoCanvas);
    const logoMat = new THREE.MeshBasicMaterial({ map: logoTexture, transparent: true });
    const logoGeo = new THREE.PlaneGeometry(0.8, 0.2);
    const logo = new THREE.Mesh(logoGeo, logoMat);
    logo.position.set(FRIDGE_WIDTH / 2 + 0.3, FRIDGE_HEIGHT / 2 - 0.3, DOOR_THICKNESS + 0.01);
    logo.rotation.z = -0.05;
    logo.userData.isLogo = true; // Mark as clickable logo
    doorPivot.add(logo);
    
    // Function to update logo text
    function updateLogoText() {
        const fridgeName = localStorage.getItem('fridgeName') || 'The Fridge';
        const ctx = logoCanvas.getContext('2d');
        ctx.fillStyle = '#F0F0F0';
        ctx.fillRect(0, 0, 256, 64);
        ctx.fillStyle = '#666666';
        ctx.font = 'italic 28px Georgia';
        
        // Center text
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fridgeName, 128, 32);
        ctx.textAlign = 'left'; // Reset
        
        logoTexture.needsUpdate = true;
    }
    
    updateLogoText();
    
    // Function to edit fridge name
    window.editFridgeName = function() {
        const currentName = localStorage.getItem('fridgeName') || 'The Fridge';
        const newName = prompt('Enter a name for your fridge:', currentName);
        
        if (newName !== null && newName.trim() !== '') {
            localStorage.setItem('fridgeName', newName.trim());
            updateLogoText();
            
            // Update page title
            document.title = newName.trim();
            
            // Show notification
            showCastNotification(`🧊 Fridge renamed to "${newName.trim()}"`);
        }
    };
    
    // Make updateLogoText available for external use
    window.updateLogoText = updateLogoText;
}

// === MAGNET DRAG SYSTEM ===
let draggedMagnet = null;
let dragPlane = null;
let dragOffset = new THREE.Vector3();

function onCanvasMouseDown(event) {
    if (isDoorOpen) return; // Don't drag when fridge is open
    
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(magnetMeshes, true);
    
    if (intersects.length > 0) {
        // Disable orbit controls during drag
        controls.enabled = false;
        
        // Find the parent magnet
        let magnet = intersects[0].object;
        while (magnet.parent && magnet.userData.type !== 'magnet') {
            magnet = magnet.parent;
        }
        
        if (magnet.userData.type === 'magnet') {
            draggedMagnet = magnet;
            
            // Create drag plane at magnet's Z position
            const planeGeo = new THREE.PlaneGeometry(10, 10);
            const planeMat = new THREE.MeshBasicMaterial({ visible: false });
            dragPlane = new THREE.Mesh(planeGeo, planeMat);
            dragPlane.position.copy(magnet.position);
            dragPlane.position.x = FRIDGE_WIDTH / 2;
            doorPivot.add(dragPlane);
            
            // Calculate offset
            const planeIntersect = raycaster.intersectObject(dragPlane);
            if (planeIntersect.length > 0) {
                dragOffset.copy(planeIntersect[0].point).sub(magnet.position);
            }
        }
    }
}

function onCanvasMouseUp(event) {
    if (draggedMagnet) {
        // Save position to database
        const magnetId = draggedMagnet.userData.magnetId;
        const doorWidth = FRIDGE_WIDTH - 0.4;
        const doorHeight = FRIDGE_HEIGHT - 0.4;
        
        // Convert back to normalized coordinates
        const posX = ((draggedMagnet.position.x - FRIDGE_WIDTH / 2) / (doorWidth / 2)) * 200;
        const posY = (draggedMagnet.position.y / (doorHeight / 2)) * 300;
        const rotation = (draggedMagnet.rotation.z * 180) / Math.PI;
        
        fetch(`http://localhost:3000/api/magnets/${magnetId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Session-Id': localStorage.getItem('sessionId')
            },
            body: JSON.stringify({ positionX: posX, positionY: posY, rotation: rotation })
        }).catch(err => console.error('Position update error:', err));
        
        // Clean up
        if (dragPlane) {
            doorPivot.remove(dragPlane);
            dragPlane = null;
        }
        draggedMagnet = null;
        controls.enabled = true;
    }
}

function onCanvasMouseDrag(event) {
    if (!draggedMagnet || !dragPlane) return;
    
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(dragPlane);
    
    if (intersects.length > 0) {
        const newPos = intersects[0].point.sub(dragOffset);
        
        // Clamp to door bounds
        const halfWidth = (FRIDGE_WIDTH - 0.4) / 2;
        const halfHeight = (FRIDGE_HEIGHT - 0.4) / 2;
        
        draggedMagnet.position.x = Math.max(FRIDGE_WIDTH / 2 - halfWidth + 0.3, 
                                            Math.min(FRIDGE_WIDTH / 2 + halfWidth - 0.3, newPos.x));
        draggedMagnet.position.y = Math.max(-halfHeight + 0.3, 
                                            Math.min(halfHeight - 0.3, newPos.y));
    }
}

let isHandleHovered = false;

function onCanvasMouseMove(event) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(doorPivot.children, true);

    const hitHandle = intersects.some(i => i.object.name === 'handle' || i.object.name === 'door');
    
    if (hitHandle && !isHandleHovered) {
        isHandleHovered = true;
        renderer.domElement.style.cursor = 'pointer';
        // Highlight handle using outline pass
        if (window.fridgeHandle && outlinePass) {
            outlinePass.selectedObjects = [window.fridgeHandle];
        }
        if (window.fridgeHandle) {
            window.fridgeHandle.material.emissive = new THREE.Color(0x222222);
        }
    } else if (!hitHandle && isHandleHovered) {
        isHandleHovered = false;
        renderer.domElement.style.cursor = 'default';
        // Remove outline
        if (outlinePass) {
            outlinePass.selectedObjects = [];
        }
        if (window.fridgeHandle) {
            window.fridgeHandle.material.emissive = new THREE.Color(0x000000);
        }
    }
    
    // Check for magnet hover to show caption
    const magnetRaycaster = new THREE.Raycaster();
    magnetRaycaster.setFromCamera(mouse, camera);
    const magnetIntersects = magnetRaycaster.intersectObjects(magnetMeshes, true);
    
    if (magnetIntersects.length > 0) {
        const hitObject = magnetIntersects[0].object;
        const magnet = hitObject.userData.type === 'magnet' ? hitObject : hitObject.parent;
        
        if (magnet && magnet.userData.magnetId && magnet.userData.caption) {
            showMagnetCaption(magnet, event);
            return;
        }
    }
    
    hideMagnetCaption();
}

function onCanvasClick(event) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    
    // Check for logo click to edit fridge name
    if (!isDoorOpen) {
        const logoIntersects = raycaster.intersectObjects(doorPivot.children.filter(obj => obj.userData.isLogo));
        if (logoIntersects.length > 0) {
            editFridgeName();
            return;
        }
    }
    
    // Check for countdown resize button clicks
    if (countdownMesh && !isDoorOpen) {
        const countdownIntersects = raycaster.intersectObject(countdownMesh);
        if (countdownIntersects.length > 0) {
            const uv = countdownIntersects[0].uv;
            if (uv) {
                // Check for delete X button (top left corner)
                if (uv.x < 0.12 && uv.y > 0.75) {
                    if (confirm('Delete this calendar countdown?')) {
                        deleteCalendarCountdown();
                    }
                    return;
                }
                
                // Check if click is on the +/- buttons (bottom corners)
                // - button is at bottom left (around x=0.1), + button is at bottom right (around x=0.9)
                const clickY = 1 - uv.y; // Convert UV to canvas coordinates
                if (clickY > 0.85) { // Bottom 15% of the countdown
                    if (uv.x < 0.15) {
                        // - button clicked
                        countdownScale = Math.max(0.3, countdownScale - 0.1);
                        saveCountdownScale();
                        updateFridgeCountdownDisplay();
                        return;
                    } else if (uv.x > 0.85) {
                        // + button clicked
                        countdownScale = Math.min(2.0, countdownScale + 0.1);
                        saveCountdownScale();
                        updateFridgeCountdownDisplay();
                        return;
                    }
                }
            }
        }
    }
    
    // Check for calendar click
    if (calendarMesh) {
        const calendarIntersects = raycaster.intersectObject(calendarMesh);
        if (calendarIntersects.length > 0) {
            showCalendarCountdowns();
            return;
        }
    }
    
    // Check for settings items first (when door is open)
    if (isDoorOpen) {
        const settingsIntersects = raycaster.intersectObjects(settingsPanels, true);
        if (settingsIntersects.length > 0) {
            if (handleSettingsClick(settingsIntersects)) {
                return; // Handled a settings click
            }
        }
    }
    
    // Check for magnet clicks (for selection/deletion) - includes postcards and countdown
    const magnetIntersects = raycaster.intersectObjects(magnetMeshes, true);
    
    // Also check countdown if it exists
    if (countdownMesh && !isDoorOpen) {
        const countdownHits = raycaster.intersectObject(countdownMesh);
        if (countdownHits.length > 0) {
            magnetIntersects.push(...countdownHits);
        }
    }
    
    if (magnetIntersects.length > 0) {
        const clickedMagnet = magnetIntersects[0].object;
        // Find the parent magnet if we hit a child (frame/shadow)
        const magnet = clickedMagnet.userData.type === 'magnet' ? clickedMagnet : clickedMagnet.parent;
        
        // Handle countdown or postcard
        if (magnet && (magnet.userData.isCountdown || magnet.userData.isPostcard || magnet.userData.magnetId)) {
            // Double-click detection
            if (event.detail === 2) {
                if (confirm('Delete this magnet?')) {
                    // Call API to delete
                    const magnetId = magnet.userData.magnetId;
                    fetch(`http://localhost:3000/api/magnets/${magnetId}`, {
                        method: 'DELETE',
                        headers: { 'X-Session-Id': localStorage.getItem('sessionId') }
                    }).then(() => {
                        remove3DMagnet(magnetId);
                    }).catch(err => console.error('Delete error:', err));
                }
            } else {
                // Single click - open fullscreen viewer
                openMagnetFullscreen(magnet);
            }
            return; // Don't toggle door when clicking magnets
        }
    }
    
    // Check for door/handle click
    const intersects = raycaster.intersectObjects(doorPivot.children, true);

    if (intersects.length > 0) {
        // Check if we hit the door surface (not handle)
        const hitDoor = intersects.some(i => i.object.name === 'door' || i.object.name === 'doorSurface');
        const hitHandle = intersects.some(i => i.object.name === 'handle');
        
        if (hitHandle) {
            // Click on handle toggles door
            toggleDoor();
        } else if (hitDoor && !isDoorOpen) {
            // Click on door surface shows add content menu
            showAddContentMenu();
        } else if (hitDoor && isDoorOpen) {
            // Click on open door closes it
            toggleDoor();
        }
    }
}

// Handle mouse wheel for resizing countdown
function onCanvasWheel(event) {
    if (isDoorOpen || !countdownMesh) return;
    
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    
    // Check if hovering over countdown
    const countdownIntersects = raycaster.intersectObject(countdownMesh);
    if (countdownIntersects.length > 0) {
        event.preventDefault();
        
        // Scroll down = smaller, scroll up = larger
        const delta = event.deltaY > 0 ? -0.05 : 0.05;
        countdownScale = Math.max(0.3, Math.min(2.0, countdownScale + delta));
        saveCountdownScale();
        updateFridgeCountdownDisplay();
    }
}

// Display magnet count notification
function updateMagnetCountDisplay() {
    const count = magnetMeshes.length;
    
    // Find or create the notification element
    let notification = document.getElementById('magnet-count-notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'magnet-count-notification';
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.75);
            color: white;
            padding: 10px 16px;
            border-radius: 20px;
            font-family: 'Patrick Hand', cursive;
            font-size: 16px;
            z-index: 1000;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(notification);
    }
    
    notification.innerHTML = `📌 ${count} magnet${count !== 1 ? 's' : ''} pinned`;
    notification.style.opacity = '1';
    
    // Show briefly then fade (but always visible if magnets exist)
    if (count === 0) {
        setTimeout(() => {
            notification.style.opacity = '0';
        }, 2000);
    }
}

// Show magnet caption on hover
function showMagnetCaption(magnet, event) {
    let captionBox = document.getElementById('magnet-caption-box');
    if (!captionBox) {
        captionBox = document.createElement('div');
        captionBox.id = 'magnet-caption-box';
        captionBox.style.cssText = `
            position: fixed;
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-family: 'Patrick Hand', cursive;
            font-size: 14px;
            z-index: 2000;
            pointer-events: none;
            max-width: 300px;
            word-wrap: break-word;
            box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        `;
        document.body.appendChild(captionBox);
    }
    
    const caption = magnet.userData.caption || 'Photo';
    captionBox.textContent = caption;
    captionBox.style.left = (event.clientX + 15) + 'px';
    captionBox.style.top = (event.clientY + 15) + 'px';
    captionBox.style.display = 'block';
}

// Hide magnet caption
function hideMagnetCaption() {
    const captionBox = document.getElementById('magnet-caption-box');
    if (captionBox) {
        captionBox.style.display = 'none';
    }
}

// 3D Magnet Viewer - Camera Animation System
let currentViewedMagnet = null;
let isViewingMagnet = false;
let isMagnetFlipped = false;
let originalCameraPosition = new THREE.Vector3();
let originalCameraTarget = new THREE.Vector3();
let targetCameraPosition = new THREE.Vector3();
let targetLookAt = new THREE.Vector3();
let viewerMagnetClone = null;
let magnetRotation = { x: 0, y: 0 };
let isDraggingViewer = false;
let lastMousePos = { x: 0, y: 0 };

function openMagnetFullscreen(magnet) {
    if (isViewingMagnet) return;
    
    currentViewedMagnet = magnet;
    isViewingMagnet = true;
    isMagnetFlipped = false;
    magnetRotation = { x: 0, y: 0 };
    
    // Store original camera position
    originalCameraPosition.copy(camera.position);
    originalCameraTarget.copy(controls.target);
    
    // Scale background/floor down when zooming
    if (window.floorMesh) {
        window.floorMesh.scale.set(0.3, 0.3, 0.3);
    }
    const outdoorScene = document.getElementById('outdoorScene');
    if (outdoorScene) {
        outdoorScene.style.transform = 'scale(0.3)';
        outdoorScene.style.transformOrigin = 'center center';
    }
    const wallLayer = document.getElementById('wallLayer');
    if (wallLayer) {
        wallLayer.style.transform = 'scale(0.3)';
        wallLayer.style.transformOrigin = 'center center';
    }
    
    // Get magnet world position
    const magnetWorldPos = new THREE.Vector3();
    magnet.getWorldPosition(magnetWorldPos);
    
    // Calculate camera position to view magnet up close
    // Position camera in front of the magnet
    targetLookAt.copy(magnetWorldPos);
    targetCameraPosition.set(
        magnetWorldPos.x,
        magnetWorldPos.y,
        magnetWorldPos.z + 3.5 // Move camera in front of magnet (farther to avoid clipping)
    );
    
    // Create a clone of the magnet for manipulation
    viewerMagnetClone = magnet.clone();
    viewerMagnetClone.name = 'viewerMagnetClone';
    
    // Position clone at center of view, moved forward to avoid clipping
    viewerMagnetClone.position.copy(magnetWorldPos);
    viewerMagnetClone.position.z += 0.5; // Move significantly forward from fridge surface
    scene.add(viewerMagnetClone);
    
    // Hide original magnet temporarily
    magnet.visible = false;
    
    // Show viewer UI
    showViewerControls(magnet);
    
    // Animate camera
    animateCameraToMagnet();
}

function animateCameraToMagnet() {
    const duration = 800;
    const startTime = Date.now();
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    
    function animateFrame() {
        if (!isViewingMagnet) return;
        
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        
        // Interpolate camera position
        camera.position.lerpVectors(startPos, targetCameraPosition, eased);
        controls.target.lerpVectors(startTarget, targetLookAt, eased);
        controls.update();
        
        if (progress < 1) {
            requestAnimationFrame(animateFrame);
        }
    }
    
    animateFrame();
}

function showViewerControls(magnet) {
    // Remove existing controls if any
    const existing = document.getElementById('viewer-3d-controls');
    if (existing) existing.remove();
    
    const controlsDiv = document.createElement('div');
    controlsDiv.id = 'viewer-3d-controls';
    controlsDiv.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 15px;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.5s ease;
    `;
    
    const buttonStyle = `
        padding: 15px 25px;
        background: rgba(255, 255, 255, 0.95);
        border: none;
        border-radius: 12px;
        font-size: 16px;
        cursor: pointer;
        font-family: 'Patrick Hand', cursive;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        transition: transform 0.2s, background 0.2s;
    `;
    
    // Flip button
    const flipBtn = document.createElement('button');
    flipBtn.innerHTML = '↻ Flip';
    flipBtn.style.cssText = buttonStyle;
    flipBtn.onmouseover = () => flipBtn.style.transform = 'scale(1.05)';
    flipBtn.onmouseout = () => flipBtn.style.transform = 'scale(1)';
    flipBtn.onclick = flipMagnet3D;
    controlsDiv.appendChild(flipBtn);
    
    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = '🗑️ Remove';
    removeBtn.style.cssText = buttonStyle + 'background: rgba(255, 100, 100, 0.95);';
    removeBtn.onmouseover = () => removeBtn.style.transform = 'scale(1.05)';
    removeBtn.onmouseout = () => removeBtn.style.transform = 'scale(1)';
    removeBtn.onclick = () => deleteMagnetFromViewer(magnet);
    controlsDiv.appendChild(removeBtn);
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕ Close';
    closeBtn.style.cssText = buttonStyle;
    closeBtn.onmouseover = () => closeBtn.style.transform = 'scale(1.05)';
    closeBtn.onmouseout = () => closeBtn.style.transform = 'scale(1)';
    closeBtn.onclick = closeMagnetFullscreen;
    controlsDiv.appendChild(closeBtn);
    
    // Instructions
    const instructions = document.createElement('div');
    instructions.style.cssText = `
        position: fixed;
        top: 30px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-family: 'Patrick Hand', cursive;
        font-size: 16px;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.5s ease;
    `;
    instructions.innerHTML = '🖱️ Drag to rotate • Scroll to zoom • ESC to close';
    instructions.id = 'viewer-instructions';
    document.body.appendChild(instructions);
    
    document.body.appendChild(controlsDiv);
    
    // Fade in
    setTimeout(() => {
        controlsDiv.style.opacity = '1';
        instructions.style.opacity = '1';
    }, 500);
    
    // Add keyboard listener for ESC
    document.addEventListener('keydown', handleViewerKeydown);
    
    // Add mouse controls for rotation
    renderer.domElement.addEventListener('mousedown', handleViewerMouseDown);
    renderer.domElement.addEventListener('mousemove', handleViewerMouseMove);
    renderer.domElement.addEventListener('mouseup', handleViewerMouseUp);
    renderer.domElement.addEventListener('wheel', handleViewerWheel);
}

function handleViewerKeydown(e) {
    if (e.key === 'Escape' && isViewingMagnet) {
        closeMagnetFullscreen();
    }
}

function handleViewerMouseDown(e) {
    if (!isViewingMagnet) return;
    isDraggingViewer = true;
    lastMousePos = { x: e.clientX, y: e.clientY };
}

function handleViewerMouseMove(e) {
    if (!isViewingMagnet || !isDraggingViewer || !viewerMagnetClone) return;
    
    const deltaX = e.clientX - lastMousePos.x;
    const deltaY = e.clientY - lastMousePos.y;
    
    magnetRotation.y += deltaX * 0.01;
    magnetRotation.x += deltaY * 0.01;
    
    // Apply rotation to the clone
    viewerMagnetClone.rotation.y = magnetRotation.y;
    viewerMagnetClone.rotation.x = magnetRotation.x;
    
    lastMousePos = { x: e.clientX, y: e.clientY };
}

function handleViewerMouseUp() {
    isDraggingViewer = false;
}

function handleViewerWheel(e) {
    if (!isViewingMagnet) return;
    e.preventDefault();
    
    // Zoom in/out by moving camera
    const zoomSpeed = 0.002;
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    
    camera.position.addScaledVector(direction, -e.deltaY * zoomSpeed);
}

function flipMagnet3D() {
    if (!viewerMagnetClone) return;
    
    isMagnetFlipped = !isMagnetFlipped;
    
    const duration = 600;
    const startTime = Date.now();
    const startRotation = viewerMagnetClone.rotation.y;
    const targetRotation = isMagnetFlipped ? startRotation + Math.PI : startRotation - Math.PI;
    
    function animateFlip() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease out
        const eased = 1 - Math.pow(1 - progress, 3);
        
        viewerMagnetClone.rotation.y = startRotation + (targetRotation - startRotation) * eased;
        magnetRotation.y = viewerMagnetClone.rotation.y;
        
        if (progress < 1) {
            requestAnimationFrame(animateFlip);
        }
    }
    
    animateFlip();
}

function closeMagnetFullscreen() {
    if (!isViewingMagnet) return;
    
    // Restore background/floor scale
    if (window.floorMesh) {
        window.floorMesh.scale.set(1, 1, 1);
    }
    const outdoorScene = document.getElementById('outdoorScene');
    if (outdoorScene) {
        outdoorScene.style.transform = 'scale(1)';
    }
    const wallLayer = document.getElementById('wallLayer');
    if (wallLayer) {
        wallLayer.style.transform = 'scale(1)';
    }
    
    // Remove UI controls
    const controlsDiv = document.getElementById('viewer-3d-controls');
    const instructions = document.getElementById('viewer-instructions');
    if (controlsDiv) {
        controlsDiv.style.opacity = '0';
        setTimeout(() => controlsDiv.remove(), 300);
    }
    if (instructions) {
        instructions.style.opacity = '0';
        setTimeout(() => instructions.remove(), 300);
    }
    
    // Remove event listeners
    document.removeEventListener('keydown', handleViewerKeydown);
    renderer.domElement.removeEventListener('mousedown', handleViewerMouseDown);
    renderer.domElement.removeEventListener('mousemove', handleViewerMouseMove);
    renderer.domElement.removeEventListener('mouseup', handleViewerMouseUp);
    renderer.domElement.removeEventListener('wheel', handleViewerWheel);
    
    // Animate camera back
    const duration = 600;
    const startTime = Date.now();
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    
    function animateBack() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const eased = 1 - Math.pow(1 - progress, 3);
        
        camera.position.lerpVectors(startPos, originalCameraPosition, eased);
        controls.target.lerpVectors(startTarget, originalCameraTarget, eased);
        controls.update();
        
        if (progress < 1) {
            requestAnimationFrame(animateBack);
        } else {
            // Cleanup
            if (viewerMagnetClone) {
                scene.remove(viewerMagnetClone);
                viewerMagnetClone = null;
            }
            if (currentViewedMagnet) {
                currentViewedMagnet.visible = true;
            }
            isViewingMagnet = false;
            currentViewedMagnet = null;
            isMagnetFlipped = false;
        }
    }
    
    animateBack();
}

function deleteMagnetFromViewer(magnet) {
    if (confirm('Remove this magnet from your fridge?')) {
        const magnetId = magnet.userData.magnetId;
        
        // Close viewer with reverse animation
        closeMagnetFullscreen();
        
        // Delete from server
        fetch(`http://localhost:3000/api/magnets/${magnetId}`, {
            method: 'DELETE',
            headers: { 'X-Session-Id': localStorage.getItem('sessionId') }
        }).then(() => {
            remove3DMagnet(magnetId);
        }).catch(err => console.error('Delete error:', err));
    }
}

// User Flow UI for adding content
function createUserFlowUI() {
    // Create floating action button (FAB)
    const fab = document.createElement('div');
    fab.id = 'add-content-fab';
    fab.innerHTML = '+';
    fab.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 30px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        font-size: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 9999;
        transition: transform 0.2s;
        font-family: Arial;
    `;
    fab.onmouseover = () => fab.style.transform = 'scale(1.1)';
    fab.onmouseout = () => fab.style.transform = 'scale(1)';
    fab.onclick = showAddContentMenu;
    document.body.appendChild(fab);
    
    // Create Cast button
    const castBtn = document.createElement('div');
    castBtn.id = 'cast-btn';
    castBtn.innerHTML = '📺';
    castBtn.title = 'Cast to Screen';
    castBtn.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 30px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: linear-gradient(135deg, #2196F3 0%, #21CBF3 100%);
        color: white;
        font-size: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 9999;
        transition: transform 0.2s;
    `;
    castBtn.onmouseover = () => castBtn.style.transform = 'scale(1.1)';
    castBtn.onmouseout = () => castBtn.style.transform = 'scale(1)';
    castBtn.onclick = startScreenCast;
    document.body.appendChild(castBtn);
    
    // Create popup menu
    const menu = document.createElement('div');
    menu.id = 'add-content-menu';
    menu.style.cssText = `
        position: fixed;
        bottom: 150px;
        right: 30px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        padding: 20px;
        z-index: 9998;
        display: none;
        min-width: 250px;
    `;
    menu.innerHTML = `
        <div style=\"font-family: 'Patrick Hand', cursive; font-size: 20px; margin-bottom: 15px; color: #333;\">Add to Fridge</div>
        <button id=\"add-picture-btn\" style=\"
            width: 100%;
            padding: 15px;
            margin-bottom: 10px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            font-family: 'Patrick Hand', cursive;
        \">📷 Add Picture</button>
        <button id=\"add-postcard-btn\" style=\"
            width: 100%;
            padding: 15px;
            margin-bottom: 10px;
            background: #f59e0b;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            font-family: 'Patrick Hand', cursive;
        \">📝 Add Postcard</button>
        <button id=\"add-calendar-event-btn\" style=\"
            width: 100%;
            padding: 15px;
            background: #D32F2F;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            font-family: 'Patrick Hand', cursive;
        \">📅 Add Calendar Event</button>
    `;
    document.body.appendChild(menu);
    
    // Wire up buttons
    document.getElementById('add-picture-btn').onclick = () => {
        hideAddContentMenu();
        promptAddMagnet();
    };
    
    document.getElementById('add-postcard-btn').onclick = () => {
        hideAddContentMenu();
        showPostcardDialog();
    };
    
    document.getElementById('add-calendar-event-btn').onclick = () => {
        hideAddContentMenu();
        showCalendarCountdowns();
    };
}

function showAddContentMenu() {
    const menu = document.getElementById('add-content-menu');
    menu.style.display = 'block';
    
    // Close on click outside
    const closeListener = (e) => {
        if (!menu.contains(e.target) && e.target.id !== 'add-content-fab') {
            hideAddContentMenu();
            document.removeEventListener('click', closeListener);
        }
    };
    setTimeout(() => document.addEventListener('click', closeListener), 100);
}

function hideAddContentMenu() {
    const menu = document.getElementById('add-content-menu');
    menu.style.display = 'none';
}

// Screen Casting functionality - Chromecast and network devices
let castStream = null;
let pipWindow = null;
let presentationConnection = null;
let presentationRequest = null;

async function startScreenCast() {
    // Show casting options menu
    showCastMenu();
}

function showCastMenu() {
    let menu = document.getElementById('cast-menu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        return;
    }
    
    menu = document.createElement('div');
    menu.id = 'cast-menu';
    menu.style.cssText = `
        position: fixed;
        bottom: 140px;
        left: 30px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        padding: 15px;
        z-index: 10000;
        min-width: 220px;
    `;
    
    menu.innerHTML = `
        <div style="font-family: 'Patrick Hand', cursive; font-size: 18px; margin-bottom: 12px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 8px;">
            📺 Cast to Device
        </div>
        <button id="cast-chromecast" style="
            width: 100%;
            padding: 12px;
            margin-bottom: 8px;
            background: #4285F4;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
            font-family: 'Patrick Hand', cursive;
            display: flex;
            align-items: center;
            gap: 8px;
        ">
            <span style="font-size: 18px;">📡</span> Chromecast / Smart TV
        </button>
        <button id="cast-presentation" style="
            width: 100%;
            padding: 12px;
            margin-bottom: 8px;
            background: #34A853;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
            font-family: 'Patrick Hand', cursive;
            display: flex;
            align-items: center;
            gap: 8px;
        ">
            <span style="font-size: 18px;">🖥️</span> External Display
        </button>
        <button id="cast-pip" style="
            width: 100%;
            padding: 12px;
            margin-bottom: 8px;
            background: #9C27B0;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
            font-family: 'Patrick Hand', cursive;
            display: flex;
            align-items: center;
            gap: 8px;
        ">
            <span style="font-size: 18px;">🪟</span> Picture-in-Picture
        </button>
        <button id="cast-fullscreen" style="
            width: 100%;
            padding: 12px;
            background: #FF5722;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            cursor: pointer;
            font-family: 'Patrick Hand', cursive;
            display: flex;
            align-items: center;
            gap: 8px;
        ">
            <span style="font-size: 18px;">⛶</span> Fullscreen Mode
        </button>
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee; font-size: 12px; color: #888;">
            💡 Tip: Use browser cast (⋮ → Cast) for more options
        </div>
    `;
    
    document.body.appendChild(menu);
    
    // Wire up buttons
    document.getElementById('cast-chromecast').onclick = () => {
        hideCastMenu();
        castToChromecast();
    };
    
    document.getElementById('cast-presentation').onclick = () => {
        hideCastMenu();
        castToPresentation();
    };
    
    document.getElementById('cast-pip').onclick = () => {
        hideCastMenu();
        openPictureInPicture();
    };
    
    document.getElementById('cast-fullscreen').onclick = () => {
        hideCastMenu();
        enterFullscreen();
    };
    
    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', closeCastMenuOnOutsideClick);
    }, 100);
}

function closeCastMenuOnOutsideClick(e) {
    const menu = document.getElementById('cast-menu');
    const castBtn = document.getElementById('cast-btn');
    if (menu && !menu.contains(e.target) && e.target !== castBtn) {
        hideCastMenu();
        document.removeEventListener('click', closeCastMenuOnOutsideClick);
    }
}

function hideCastMenu() {
    const menu = document.getElementById('cast-menu');
    if (menu) menu.style.display = 'none';
}

// Cast using browser's built-in Chromecast support
async function castToChromecast() {
    try {
        // Check for Remote Playback API (for video casting)
        if ('RemotePlayback' in window) {
            // Create a video element from the canvas
            const canvas = renderer.domElement;
            const stream = canvas.captureStream(30);
            
            const video = document.createElement('video');
            video.srcObject = stream;
            video.muted = true;
            video.style.display = 'none';
            document.body.appendChild(video);
            
            if (video.remote) {
                video.remote.watchAvailability((available) => {
                    if (available) {
                        video.remote.prompt().then(() => {
                            showCastNotification('📡 Connected to Chromecast!');
                            updateCastButton(true);
                            video.play();
                        }).catch(err => {
                            console.log('Remote playback prompt cancelled');
                            document.body.removeChild(video);
                        });
                    } else {
                        showCastError('No Chromecast devices found');
                        document.body.removeChild(video);
                    }
                }).catch(err => {
                    // Remote playback not available, try Presentation API
                    document.body.removeChild(video);
                    castToPresentation();
                });
            } else {
                document.body.removeChild(video);
                // Fallback: Show instructions for manual casting
                showCastInstructions();
            }
        } else {
            showCastInstructions();
        }
    } catch (err) {
        console.error('Chromecast error:', err);
        showCastInstructions();
    }
}

// Show instructions for browser casting
function showCastInstructions() {
    const isChrome = navigator.userAgent.includes('Chrome');
    const isEdge = navigator.userAgent.includes('Edg');
    
    let instructions = '';
    if (isChrome || isEdge) {
        instructions = `
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 48px; margin-bottom: 15px;">📡</div>
                <h3 style="margin: 0 0 15px 0; font-family: 'Patrick Hand', cursive;">Cast to Chromecast</h3>
                <p style="color: #666; margin-bottom: 20px;">Use your browser's built-in casting:</p>
                <ol style="text-align: left; color: #444; line-height: 1.8;">
                    <li>Click the <strong>⋮</strong> menu (top right)</li>
                    <li>Select <strong>"Cast..."</strong></li>
                    <li>Choose your Chromecast device</li>
                    <li>Select <strong>"Cast tab"</strong></li>
                </ol>
                <p style="color: #888; font-size: 14px; margin-top: 15px;">
                    Or press <kbd style="background: #eee; padding: 2px 6px; border-radius: 4px;">Ctrl+Shift+P</kbd> and search "Cast"
                </p>
            </div>
        `;
    } else {
        instructions = `
            <div style="text-align: center; padding: 20px;">
                <div style="font-size: 48px; margin-bottom: 15px;">📺</div>
                <h3 style="margin: 0 0 15px 0; font-family: 'Patrick Hand', cursive;">Cast to Device</h3>
                <p style="color: #666;">For best Chromecast support, use Chrome or Edge browser.</p>
                <p style="color: #888; font-size: 14px; margin-top: 15px;">
                    Try "External Display" or "Picture-in-Picture" options instead.
                </p>
            </div>
        `;
    }
    
    showModal(instructions);
}

// Cast using Presentation API (for external displays)
async function castToPresentation() {
    try {
        if (!('PresentationRequest' in window)) {
            showCastError('Presentation API not supported. Try Chrome or Edge.');
            return;
        }
        
        // Create presentation URL (current page URL)
        const presentationUrl = window.location.href;
        presentationRequest = new PresentationRequest([presentationUrl]);
        
        // Check availability
        presentationRequest.getAvailability().then(availability => {
            if (availability.value) {
                startPresentation();
            } else {
                showCastError('No external displays found');
            }
            
            availability.onchange = () => {
                if (availability.value) {
                    showCastNotification('External display available');
                }
            };
        }).catch(() => {
            // Availability monitoring not supported, try anyway
            startPresentation();
        });
        
    } catch (err) {
        console.error('Presentation error:', err);
        showCastError('Could not start presentation: ' + err.message);
    }
}

async function startPresentation() {
    try {
        presentationConnection = await presentationRequest.start();
        
        presentationConnection.onconnect = () => {
            showCastNotification('🖥️ Connected to external display!');
            updateCastButton(true);
        };
        
        presentationConnection.onclose = () => {
            presentationConnection = null;
            updateCastButton(false);
            showCastNotification('Presentation ended');
        };
        
        presentationConnection.onterminate = () => {
            presentationConnection = null;
            updateCastButton(false);
        };
        
    } catch (err) {
        if (err.name !== 'NotAllowedError') {
            showCastError('Could not connect: ' + err.message);
        }
    }
}

function showModal(content) {
    let modal = document.getElementById('cast-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cast-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10002;
        `;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div style="background: white; border-radius: 16px; max-width: 400px; position: relative;">
            <button onclick="closeModal()" style="
                position: absolute;
                top: 10px;
                right: 10px;
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: #999;
            ">✕</button>
            ${content}
        </div>
    `;
    modal.style.display = 'flex';
}

window.closeModal = function() {
    const modal = document.getElementById('cast-modal');
    if (modal) modal.style.display = 'none';
};

// Enter fullscreen mode
function enterFullscreen() {
    const container = document.getElementById('three-container') || document.body;
    
    if (container.requestFullscreen) {
        container.requestFullscreen();
    } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
    } else if (container.msRequestFullscreen) {
        container.msRequestFullscreen();
    }
    
    showCastNotification('⛶ Fullscreen mode - Press ESC to exit');
}

async function openPictureInPicture() {
    try {
        // Check if Document PiP is supported
        if (!('documentPictureInPicture' in window)) {
            // Fallback to video element PiP
            await openVideoPictureInPicture();
            return;
        }
        
        // Create a new document PiP window
        pipWindow = await window.documentPictureInPicture.requestWindow({
            width: 800,
            height: 600
        });
        
        // Clone the canvas to the PiP window
        const canvas = renderer.domElement;
        const pipCanvas = document.createElement('canvas');
        pipCanvas.width = canvas.width;
        pipCanvas.height = canvas.height;
        pipCanvas.style.cssText = 'width: 100%; height: 100%; object-fit: contain; background: #1a1a1a;';
        
        pipWindow.document.body.style.cssText = 'margin: 0; padding: 0; background: #1a1a1a; display: flex; align-items: center; justify-content: center; overflow: hidden;';
        pipWindow.document.body.appendChild(pipCanvas);
        
        const pipCtx = pipCanvas.getContext('2d');
        
        // Update PiP canvas on each render
        function updatePipCanvas() {
            if (!pipWindow || pipWindow.closed) {
                castStream = null;
                updateCastButton(false);
                return;
            }
            pipCtx.drawImage(canvas, 0, 0);
            requestAnimationFrame(updatePipCanvas);
        }
        
        updatePipCanvas();
        updateCastButton(true);
        showCastNotification('🪟 Picture-in-Picture window opened');
        
        // Handle window close
        pipWindow.addEventListener('pagehide', () => {
            castStream = null;
            pipWindow = null;
            updateCastButton(false);
        });
        
    } catch (err) {
        console.error('PiP error:', err);
        // Try video element PiP as fallback
        await openVideoPictureInPicture();
    }
}

// Fallback PiP using video element
async function openVideoPictureInPicture() {
    try {
        const canvas = renderer.domElement;
        const stream = canvas.captureStream(30);
        
        let pipVideo = document.getElementById('pip-video');
        if (!pipVideo) {
            pipVideo = document.createElement('video');
            pipVideo.id = 'pip-video';
            pipVideo.style.cssText = 'position: fixed; bottom: -1000px; left: -1000px; pointer-events: none;';
            pipVideo.muted = true;
            document.body.appendChild(pipVideo);
        }
        
        pipVideo.srcObject = stream;
        await pipVideo.play();
        
        if (document.pictureInPictureEnabled) {
            await pipVideo.requestPictureInPicture();
            updateCastButton(true);
            showCastNotification('🪟 Picture-in-Picture started');
            
            pipVideo.addEventListener('leavepictureinpicture', () => {
                updateCastButton(false);
                pipVideo.srcObject = null;
            }, { once: true });
        } else {
            throw new Error('PiP not enabled');
        }
    } catch (err) {
        console.error('Video PiP error:', err);
        showCastError('Picture-in-Picture not supported. Try fullscreen instead.');
    }
}

function updateCastButton(isCasting) {
    const castBtn = document.getElementById('cast-btn');
    if (castBtn) {
        if (isCasting) {
            castBtn.innerHTML = '🔴';
            castBtn.style.background = 'linear-gradient(135deg, #f44336 0%, #ff5722 100%)';
            castBtn.title = 'Stop Casting';
            castBtn.onclick = stopScreenCast;
        } else {
            castBtn.innerHTML = '📺';
            castBtn.style.background = 'linear-gradient(135deg, #2196F3 0%, #21CBF3 100%)';
            castBtn.title = 'Cast to Screen';
            castBtn.onclick = startScreenCast;
        }
    }
}

function stopScreenCast() {
    if (castStream) {
        castStream.getTracks().forEach(track => track.stop());
        castStream = null;
    }
    if (pipWindow && !pipWindow.closed) {
        pipWindow.close();
        pipWindow = null;
    }
    if (presentationConnection) {
        presentationConnection.terminate();
        presentationConnection = null;
    }
    // Stop video PiP if active
    const pipVideo = document.getElementById('pip-video');
    if (pipVideo && document.pictureInPictureElement === pipVideo) {
        document.exitPictureInPicture();
    }
    updateCastButton(false);
    hideCastMenu();
    showCastNotification('Casting stopped');
}

function showCastNotification(message) {
    let notification = document.getElementById('cast-notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'cast-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 15px 25px;
            border-radius: 12px;
            font-family: 'Patrick Hand', cursive;
            font-size: 18px;
            z-index: 10001;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        document.body.appendChild(notification);
    }
    
    notification.textContent = message;
    notification.style.opacity = '1';
    
    setTimeout(() => {
        notification.style.opacity = '0';
    }, 3000);
}

function showCastError(message) {
    showCastNotification('❌ ' + message);
}

// Prompt user to add a magnet image
function promptAddMagnet() {
    // Show current magnet count
    console.log(`📌 Current magnets: ${magnetMeshes.length}`);
    
    // Create hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (!file.type.startsWith('image/')) {
            alert('Only images are supported for magnets');
            return;
        }
        
        const sessionId = localStorage.getItem('sessionId');
        if (!sessionId) {
            alert('Please log in first');
            return;
        }
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('caption', file.name);
        formData.append('positionX', (Math.random() * 100 - 50));
        formData.append('positionY', (Math.random() * 150 - 75));
        formData.append('rotation', Math.random() * 20 - 10);
        
        try {
            const response = await fetch('http://localhost:3000/api/magnets', {
                method: 'POST',
                headers: { 'X-Session-Id': sessionId },
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok) {
                const mediaUrl = `http://localhost:3000/uploads/${data.filePath}`;
                add3DMagnet(mediaUrl, data.id, data.positionX, data.positionY, data.rotation, data.caption);
            } else {
                alert(data.error);
            }
        } catch (err) {
            console.error('Upload error:', err);
            alert('Failed to upload. Make sure backend is running.');
        }
        
        // Clean up
        document.body.removeChild(fileInput);
    });
    
    fileInput.click();
}

function toggleDoor() {
    isDoorOpen = !isDoorOpen;
    doorTargetRotation = isDoorOpen ? -Math.PI * 0.6 : 0;
    window.isDoorOpenGlobal = isDoorOpen;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
    outlinePass.resolution.set(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    // Smooth door animation
    if (doorPivot) {
        doorPivot.rotation.y += (doorTargetRotation - doorPivot.rotation.y) * 0.08;
    }

    // Sync with script.js state
    if (typeof window.isDoorOpenGlobal !== 'undefined' && window.isDoorOpenGlobal !== isDoorOpen) {
        isDoorOpen = window.isDoorOpenGlobal;
        doorTargetRotation = isDoorOpen ? -Math.PI * 0.6 : 0;
    }

    controls.update();
    
    // Use composer for outline effect
    composer.render();
    cssRenderer.render(scene, camera);
}

window.toggle3DDoor = toggleDoor;

// === WALL CALENDAR ===
let calendarMesh;
let calendarCountdowns = [];
let countdownScale = 1.0; // User-adjustable scale for countdown display

// Helper functions for rounded rectangles
function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function roundRectTop(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function roundRectBottom(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y);
    ctx.closePath();
}

function createWallCalendar() {
    updateWallCalendar();
}

function updateWallCalendar() {
    // Remove existing calendar if it exists
    if (calendarMesh) {
        scene.remove(calendarMesh);
        if (calendarMesh.material.map) calendarMesh.material.map.dispose();
        if (calendarMesh.material) calendarMesh.material.dispose();
        if (calendarMesh.geometry) calendarMesh.geometry.dispose();
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Calendar background
    ctx.fillStyle = '#FFF';
    ctx.fillRect(0, 0, 512, 512);
    
    // Red header
    ctx.fillStyle = '#D32F2F';
    ctx.fillRect(0, 0, 512, 100);
    
    // Month/Year
    const now = new Date();
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(monthNames[now.getMonth()], 256, 60);
    ctx.font = '28px Arial';
    ctx.fillText(now.getFullYear(), 256, 90);
    
    // Days of week
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    ctx.fillStyle = '#666';
    ctx.font = 'bold 24px Arial';
    for (let i = 0; i < 7; i++) {
        ctx.fillText(days[i], 40 + i * 68, 140);
    }
    
    // Calendar grid
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    
    // Check if there's an event this month
    let eventDay = null;
    if (calendarCountdowns.length > 0) {
        const eventDate = new Date(calendarCountdowns[0].date);
        if (eventDate.getMonth() === now.getMonth() && eventDate.getFullYear() === now.getFullYear()) {
            eventDay = eventDate.getDate();
        }
    }
    
    ctx.font = '24px Arial';
    let dayNum = 1;
    for (let week = 0; week < 6; week++) {
        for (let day = 0; day < 7; day++) {
            if ((week === 0 && day < firstDay) || dayNum > daysInMonth) continue;
            
            const x = 40 + day * 68;
            const y = 180 + week * 60;
            
            // Highlight event date with pink/heart
            if (eventDay && dayNum === eventDay) {
                // Draw heart shape for event
                ctx.fillStyle = '#FF69B4';
                ctx.beginPath();
                ctx.arc(x, y, 22, 0, Math.PI * 2);
                ctx.fill();
                // Add sparkle border
                ctx.strokeStyle = '#FFB6C1';
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.fillStyle = '#FFF';
                ctx.font = 'bold 24px Arial';
            }
            // Highlight today
            else if (dayNum === now.getDate()) {
                ctx.fillStyle = '#D32F2F';
                ctx.beginPath();
                ctx.arc(x, y, 20, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#FFF';
                ctx.font = '24px Arial';
            } else {
                ctx.fillStyle = '#333';
                ctx.font = '24px Arial';
            }
            
            ctx.fillText(dayNum, x, y + 8);
            dayNum++;
        }
    }
    
    // Add event name at bottom if event is this month
    if (eventDay && calendarCountdowns.length > 0) {
        ctx.fillStyle = '#FF69B4';
        ctx.font = 'italic 18px Georgia';
        ctx.fillText('💕 ' + calendarCountdowns[0].name, 256, 495);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(1.5, 1.5);
    const mat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
    calendarMesh = new THREE.Mesh(geo, mat);
    calendarMesh.position.set(-4, 0.5, 0);
    calendarMesh.name = 'calendar';
    calendarMesh.userData = { type: 'calendar' };
    scene.add(calendarMesh);
}

function showPostcardDialog() {
    // Create postcard dialog
    let dialog = document.getElementById('postcard-dialog');
    if (!dialog) {
        dialog = document.createElement('div');
        dialog.id = 'postcard-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        dialog.innerHTML = `
            <div style="background: white; border-radius: 16px; padding: 30px; max-width: 500px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);">
                <h2 style="font-family: 'Patrick Hand', cursive; font-size: 28px; margin-bottom: 20px; color: #333;">📝 Add Postcard</h2>
                
                <label style="display: block; margin-bottom: 8px; font-family: 'Patrick Hand', cursive; font-size: 16px; color: #666;">
                    Message:
                </label>
                <textarea id="postcard-text" placeholder="Write your message here..." style="
                    width: 100%;
                    min-height: 120px;
                    padding: 12px;
                    margin-bottom: 20px;
                    border: 2px solid #ddd;
                    border-radius: 8px;
                    font-family: 'Patrick Hand', cursive;
                    font-size: 18px;
                    resize: vertical;
                    box-sizing: border-box;
                "></textarea>
                
                <label style="display: block; margin-bottom: 8px; font-family: 'Patrick Hand', cursive; font-size: 16px; color: #666;">
                    Card Color:
                </label>
                <div style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
                    <button class="color-btn" data-color="#FFFACD" style="width: 40px; height: 40px; border-radius: 8px; border: 2px solid #ddd; cursor: pointer; background: #FFFACD;" title="Pale Yellow"></button>
                    <button class="color-btn" data-color="#FFE4E1" style="width: 40px; height: 40px; border-radius: 8px; border: 2px solid #ddd; cursor: pointer; background: #FFE4E1;" title="Misty Rose"></button>
                    <button class="color-btn" data-color="#E0F2F1" style="width: 40px; height: 40px; border-radius: 8px; border: 2px solid #ddd; cursor: pointer; background: #E0F2F1;" title="Mint"></button>
                    <button class="color-btn" data-color="#F3E5F5" style="width: 40px; height: 40px; border-radius: 8px; border: 2px solid #ddd; cursor: pointer; background: #F3E5F5;" title="Lavender"></button>
                    <button class="color-btn" data-color="#FFF9C4" style="width: 40px; height: 40px; border-radius: 8px; border: 2px solid #ddd; cursor: pointer; background: #FFF9C4;" title="Light Yellow"></button>
                    <button class="color-btn" data-color="#FFFFFF" style="width: 40px; height: 40px; border-radius: 8px; border: 2px solid #ddd; cursor: pointer; background: #FFFFFF;" title="White"></button>
                </div>
                
                <div style="display: flex; gap: 10px;">
                    <button id="postcard-add-btn" style="
                        flex: 1;
                        padding: 12px;
                        background: #f59e0b;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        font-size: 16px;
                        cursor: pointer;
                        font-family: 'Patrick Hand', cursive;
                    ">Add Postcard</button>
                    <button id="postcard-cancel-btn" style="
                        flex: 1;
                        padding: 12px;
                        background: #ddd;
                        color: #333;
                        border: none;
                        border-radius: 8px;
                        font-size: 16px;
                        cursor: pointer;
                        font-family: 'Patrick Hand', cursive;
                    ">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // Color selection
        let selectedColor = '#FFFACD';
        const colorBtns = dialog.querySelectorAll('.color-btn');
        colorBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                colorBtns.forEach(b => b.style.border = '2px solid #ddd');
                btn.style.border = '3px solid #f59e0b';
                selectedColor = btn.dataset.color;
            });
        });
        // Select first color by default
        colorBtns[0].style.border = '3px solid #f59e0b';
        
        // Wire up buttons
        document.getElementById('postcard-add-btn').onclick = () => {
            const text = document.getElementById('postcard-text').value.trim();
            if (text) {
                createPostcardMagnet(text, selectedColor);
                dialog.style.display = 'none';
                document.getElementById('postcard-text').value = '';
            } else {
                alert('Please write a message!');
            }
        };
        
        document.getElementById('postcard-cancel-btn').onclick = () => {
            dialog.style.display = 'none';
            document.getElementById('postcard-text').value = '';
        };
        
        // Close on outside click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.style.display = 'none';
                document.getElementById('postcard-text').value = '';
            }
        });
    }
    
    dialog.style.display = 'flex';
    setTimeout(() => document.getElementById('postcard-text').focus(), 100);
}

function createPostcardMagnet(text, bgColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    // Card background with subtle shadow
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 512, 512);
    
    // Add subtle lines like notebook paper
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 60; i < 512; i += 40) {
        ctx.beginPath();
        ctx.moveTo(40, i);
        ctx.lineTo(472, i);
        ctx.stroke();
    }
    
    // Add border
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 492, 492);
    
    // Draw text with handwritten font
    ctx.fillStyle = '#333';
    ctx.font = '28px "Patrick Hand", cursive';
    ctx.textBaseline = 'top';
    
    // Word wrap text
    const maxWidth = 432;
    const lineHeight = 40;
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    
    words.forEach(word => {
        const testLine = currentLine + (currentLine ? ' ' : '') + word;
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        } else {
            currentLine = testLine;
        }
    });
    if (currentLine) lines.push(currentLine);
    
    // Center text vertically
    const totalHeight = lines.length * lineHeight;
    let y = (512 - totalHeight) / 2;
    
    lines.forEach(line => {
        const metrics = ctx.measureText(line);
        const x = (512 - metrics.width) / 2;
        ctx.fillText(line, x, y);
        y += lineHeight;
    });
    
    // Convert to magnet
    addMagnetFromCanvas(canvas);
}

function addMagnetFromCanvas(canvas) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
    });
    
    const geometry = new THREE.PlaneGeometry(0.8, 0.8);
    const magnet = new THREE.Mesh(geometry, material);
    
    // Random position on fridge
    const randomX = (Math.random() - 0.5) * 1.5;
    const randomY = (Math.random() - 0.5) * 2.5;
    magnet.position.set(FRIDGE_WIDTH / 2 + randomX, FRIDGE_HEIGHT / 2 + randomY, DOOR_THICKNESS + 0.02);
    
    magnet.userData.type = 'magnet';
    magnet.userData.isPostcard = true;
    magnet.userData.imageData = canvas.toDataURL('image/png');
    
    doorPivot.add(magnet);
    magnetMeshes.push(magnet);
    
    saveMagnetsToLocalStorage();
}

function showCalendarCountdowns() {
    // Check if countdown already exists (limit to 1)
    if (calendarCountdowns.length > 0) {
        const existing = calendarCountdowns[0];
        const confirm = window.confirm(`You already have a countdown for "${existing.name}". Replace it?`);
        if (!confirm) return;
        calendarCountdowns = []; // Clear existing
    }
    
    // Create date picker dialog
    let dialog = document.getElementById('calendar-event-dialog');
    if (!dialog) {
        dialog = document.createElement('div');
        dialog.id = 'calendar-event-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10001;
        `;
        
        const dialogBox = document.createElement('div');
        dialogBox.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 16px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        `;
        
        dialogBox.innerHTML = `
            <h2 style="font-family: 'Patrick Hand', cursive; font-size: 28px; margin-bottom: 20px; color: #333;">📅 Add Calendar Event</h2>
            <div style="margin-bottom: 20px;">
                <label style="display: block; margin-bottom: 8px; font-family: 'Patrick Hand', cursive; font-size: 18px;">Event Name:</label>
                <input type="text" id="event-name-input" placeholder="e.g., Birthday, Vacation" style="
                    width: 100%;
                    padding: 12px;
                    border: 2px solid #ddd;
                    border-radius: 8px;
                    font-size: 16px;
                    font-family: 'Patrick Hand', cursive;
                    box-sizing: border-box;
                "/>
            </div>
            <div style="margin-bottom: 25px;">
                <label style="display: block; margin-bottom: 8px; font-family: 'Patrick Hand', cursive; font-size: 18px;">Event Date:</label>
                <input type="date" id="event-date-input" style="
                    width: 100%;
                    padding: 12px;
                    border: 2px solid #ddd;
                    border-radius: 8px;
                    font-size: 16px;
                    font-family: 'Patrick Hand', cursive;
                    box-sizing: border-box;
                "/>
            </div>
            <div style="display: flex; gap: 10px;">
                <button id="calendar-event-save-btn" style="
                    flex: 1;
                    padding: 12px;
                    background: #D32F2F;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    cursor: pointer;
                    font-family: 'Patrick Hand', cursive;
                ">Save Event</button>
                <button id="calendar-event-cancel-btn" style="
                    flex: 1;
                    padding: 12px;
                    background: #666;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 16px;
                    cursor: pointer;
                    font-family: 'Patrick Hand', cursive;
                ">Cancel</button>
            </div>
        `;
        
        dialog.appendChild(dialogBox);
        document.body.appendChild(dialog);
        
        // Wire up buttons
        document.getElementById('calendar-event-save-btn').onclick = saveCalendarEvent;
        document.getElementById('calendar-event-cancel-btn').onclick = closeCalendarEventDialog;
        
        // Close on outside click
        dialog.onclick = (e) => {
            if (e.target === dialog) {
                closeCalendarEventDialog();
            }
        };
    }
    
    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('event-date-input').min = today;
    document.getElementById('event-date-input').value = today;
    
    // Clear inputs
    document.getElementById('event-name-input').value = '';
    document.getElementById('event-name-input').focus();
    
    dialog.style.display = 'flex';
}

function saveCalendarEvent() {
    const eventName = document.getElementById('event-name-input').value.trim();
    const eventDate = document.getElementById('event-date-input').value;
    
    if (!eventName) {
        alert('Please enter an event name');
        return;
    }
    
    if (!eventDate) {
        alert('Please select a date');
        return;
    }
    
    const targetDate = new Date(eventDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Reset time for accurate day calculation
    targetDate.setHours(0, 0, 0, 0);
    
    const diffTime = targetDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Store countdown (limit 1)
    calendarCountdowns = [{ name: eventName, date: eventDate, daysUntil: diffDays }];
    
    // Save to localStorage
    localStorage.setItem('calendarCountdowns', JSON.stringify(calendarCountdowns));
    
    // Update fridge display
    updateFridgeCountdownDisplay();
    
    // Update wall calendar to show highlighted date
    updateWallCalendar();
    
    // Close dialog
    closeCalendarEventDialog();
    
    // Show success message
    showCastNotification(`✨ Event "${eventName}" added! ${diffDays} days away.`);
}

function closeCalendarEventDialog() {
    const dialog = document.getElementById('calendar-event-dialog');
    if (dialog) {
        dialog.style.display = 'none';
    }
}

// Delete calendar countdown
function deleteCalendarCountdown() {
    calendarCountdowns = [];
    localStorage.removeItem('calendarCountdowns');
    
    // Remove the mesh from the door
    if (countdownMesh) {
        doorPivot.remove(countdownMesh);
        if (countdownMesh.material.map) countdownMesh.material.map.dispose();
        if (countdownMesh.material) countdownMesh.material.dispose();
        if (countdownMesh.geometry) countdownMesh.geometry.dispose();
        countdownMesh = null;
    }
    
    // Update wall calendar to remove highlight
    updateWallCalendar();
    
    showCastNotification('Calendar countdown deleted');
}

// Load countdowns from storage
function loadCalendarCountdowns() {
    const stored = localStorage.getItem('calendarCountdowns');
    if (stored) {
        calendarCountdowns = JSON.parse(stored);
        // Update fridge display if countdown exists
        if (calendarCountdowns.length > 0) {
            updateFridgeCountdownDisplay();
            // Update wall calendar to show highlighted event date
            updateWallCalendar();
        }
    }
    // Load saved scale
    const savedScale = localStorage.getItem('countdownScale');
    if (savedScale) {
        countdownScale = parseFloat(savedScale);
    }
}

// Save countdown scale to storage
function saveCountdownScale() {
    localStorage.setItem('countdownScale', countdownScale.toString());
}

// Display countdown on fridge door
let countdownMesh;
function updateFridgeCountdownDisplay() {
    // Remove existing countdown display
    if (countdownMesh) {
        doorPivot.remove(countdownMesh);
        if (countdownMesh.material.map) countdownMesh.material.map.dispose();
        if (countdownMesh.material) countdownMesh.material.dispose();
        if (countdownMesh.geometry) countdownMesh.geometry.dispose();
    }
    
    if (calendarCountdowns.length === 0) return;
    
    const countdown = calendarCountdowns[0];
    
    // Recalculate days (in case time has passed)
    const now = new Date();
    const targetDate = new Date(countdown.date);
    const diffTime = targetDate - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // Update stored value
    countdown.daysUntil = diffDays;
    
    // Create canvas for cute flip-book countdown display
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    
    // Soft background with rounded corners effect
    ctx.fillStyle = '#FFF8F0';
    ctx.fillRect(0, 0, 512, 320);
    
    // Cute decorative border
    ctx.strokeStyle = '#FFB6C1';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 500, 308);
    ctx.strokeStyle = '#FF69B4';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, 488, 296);
    
    // Event title with cute styling
    ctx.fillStyle = '#FF69B4';
    ctx.font = 'bold 28px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('✨ ' + countdown.name + ' ✨', 256, 45);
    
    // Flip-book style digit cards
    const daysStr = Math.abs(diffDays).toString().padStart(3, '0');
    const digitWidth = 90;
    const digitHeight = 130;
    const startX = 256 - (daysStr.length * (digitWidth + 15)) / 2 + digitWidth / 2;
    
    for (let i = 0; i < daysStr.length; i++) {
        const x = startX + i * (digitWidth + 15);
        const y = 135;
        
        // Card shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        roundRect(ctx, x - digitWidth/2 + 4, y - digitHeight/2 + 4, digitWidth, digitHeight, 12);
        ctx.fill();
        
        // Card background (flip-book style with split)
        // Top half
        ctx.fillStyle = '#2D2D2D';
        roundRectTop(ctx, x - digitWidth/2, y - digitHeight/2, digitWidth, digitHeight/2, 10);
        ctx.fill();
        
        // Bottom half (slightly lighter)
        ctx.fillStyle = '#3D3D3D';
        roundRectBottom(ctx, x - digitWidth/2, y, digitWidth, digitHeight/2, 10);
        ctx.fill();
        
        // Middle split line
        ctx.fillStyle = '#222';
        ctx.fillRect(x - digitWidth/2, y - 2, digitWidth, 4);
        
        // Digit
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 72px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(daysStr[i], x, y);
        
        // Highlight reflection on top
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        roundRectTop(ctx, x - digitWidth/2 + 5, y - digitHeight/2 + 5, digitWidth - 10, digitHeight/4, 8);
        ctx.fill();
    }
    
    // "days" label with cute styling
    ctx.fillStyle = '#666';
    ctx.font = 'italic 26px Georgia';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(diffDays === 1 ? 'day to go! 💕' : 'days to go! 💕', 256, 230);
    
    // Target date display
    const targetDateStr = targetDate.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
    });
    ctx.fillStyle = '#999';
    ctx.font = '18px Arial';
    ctx.fillText(targetDateStr, 256, 260);
    
    // Delete X button (top left) - cute style
    ctx.fillStyle = '#FFB6C1';
    ctx.beginPath();
    ctx.arc(35, 35, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FF69B4';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', 35, 35);
    
    // Resize controls (bottom right) - cute style
    ctx.fillStyle = 'rgba(255, 182, 193, 0.9)';
    ctx.beginPath();
    ctx.arc(440, 290, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(485, 290, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('−', 440, 290);
    ctx.fillText('+', 485, 290);
    
    const texture = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(1.2, 0.75);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    countdownMesh = new THREE.Mesh(geo, mat);
    countdownMesh.position.set(FRIDGE_WIDTH / 2 + 0.3, FRIDGE_HEIGHT / 2 - 1.2, DOOR_THICKNESS + 0.01);
    countdownMesh.scale.set(countdownScale, countdownScale, 1);
    countdownMesh.name = 'countdown';
    countdownMesh.userData.type = 'magnet'; // Make it zoomable
    countdownMesh.userData.isCountdown = true;
    countdownMesh.userData.resizable = true;
    doorPivot.add(countdownMesh);
}

// === 3D SHELF ITEMS (Settings as physical objects) ===
function createShelfItems() {
    // Shelf 1: Color/Theme items
    createColorSwatch(-0.8, FRIDGE_HEIGHT / 2 - 0.65, -0.3, 0xE8E8E8, 'White');
    createColorSwatch(-0.3, FRIDGE_HEIGHT / 2 - 0.65, -0.3, 0xA8D8EA, 'Retro Blue');
    createColorSwatch(0.2, FRIDGE_HEIGHT / 2 - 0.65, -0.3, 0xFFE4C4, 'Cream');
    createColorSwatch(0.7, FRIDGE_HEIGHT / 2 - 0.65, -0.3, 0x98D8AA, 'Mint');

    // Shelf 2: Scene selector (miniature dioramas)
    createSceneBox(-0.8, FRIDGE_HEIGHT / 2 - 1.85, -0.2, 'city', '🏙️');
    createSceneBox(-0.25, FRIDGE_HEIGHT / 2 - 1.85, -0.2, 'yard', '🌳');
    createSceneBox(0.3, FRIDGE_HEIGHT / 2 - 1.85, -0.2, 'mountains', '⛰️');
    createSceneBox(0.85, FRIDGE_HEIGHT / 2 - 1.85, -0.2, 'beach', '🏖️');

    // Shelf 3: Wall theme samples
    createWallSample(-0.7, FRIDGE_HEIGHT / 2 - 3.05, -0.2, 'subway-tile', '#FFF');
    createWallSample(-0.1, FRIDGE_HEIGHT / 2 - 3.05, -0.2, 'painted', '#E8D4B8');
    createWallSample(0.5, FRIDGE_HEIGHT / 2 - 3.05, -0.2, 'wood-panel', '#8B5A2B');
    
    // Shelf 4 (bottom): Fridge type selector
    createFridgeTypeOption(-0.7, FRIDGE_HEIGHT / 2 - 4.1, -0.15, 'classic', 'Classic');
    createFridgeTypeOption(-0.1, FRIDGE_HEIGHT / 2 - 4.1, -0.15, 'modern', 'Modern');
    createFridgeTypeOption(0.5, FRIDGE_HEIGHT / 2 - 4.1, -0.15, 'retro', 'Retro');
}

function createColorSwatch(x, y, z, color, name) {
    const geo = new THREE.BoxGeometry(0.35, 0.25, 0.25);
    const mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.6,
        metalness: 0.1
    });
    const swatch = new THREE.Mesh(geo, mat);
    swatch.position.set(x, y, z);
    swatch.castShadow = true;
    swatch.userData = { type: 'colorSwatch', color: color, name: name };
    swatch.name = 'settingsItem';
    interiorGroup.add(swatch);
    settingsPanels.push(swatch);
}

function createSceneBox(x, y, z, sceneType, emoji) {
    // Create a small box with emoji texture
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Background based on scene type
    const bgColors = {
        city: '#4A5568',
        yard: '#68D391',
        mountains: '#9CA3AF',
        beach: '#F6E05E'
    };
    ctx.fillStyle = bgColors[sceneType] || '#666';
    ctx.fillRect(0, 0, 128, 128);
    
    // Emoji
    ctx.font = '64px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    const geo = new THREE.BoxGeometry(0.4, 0.35, 0.3);
    const materials = [
        new THREE.MeshStandardMaterial({ color: 0x555555 }),
        new THREE.MeshStandardMaterial({ color: 0x555555 }),
        new THREE.MeshStandardMaterial({ color: 0x555555 }),
        new THREE.MeshStandardMaterial({ color: 0x555555 }),
        new THREE.MeshStandardMaterial({ map: texture }),
        new THREE.MeshStandardMaterial({ color: 0x444444 })
    ];
    const box = new THREE.Mesh(geo, materials);
    box.position.set(x, y, z);
    box.castShadow = true;
    box.userData = { type: 'sceneSelector', sceneType: sceneType };
    box.name = 'settingsItem';
    interiorGroup.add(box);
    settingsPanels.push(box);
}

function createWallSample(x, y, z, wallType, color) {
    const geo = new THREE.BoxGeometry(0.45, 0.4, 0.1);
    
    // Create texture based on wall type
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    if (wallType === 'subway-tile') {
        ctx.fillStyle = '#FFF';
        ctx.fillRect(0, 0, 64, 64);
        ctx.strokeStyle = '#DDD';
        ctx.lineWidth = 1;
        for (let row = 0; row < 4; row++) {
            const offset = row % 2 === 0 ? 0 : 16;
            for (let col = -1; col < 3; col++) {
                ctx.strokeRect(offset + col * 32, row * 16, 32, 16);
            }
        }
    } else if (wallType === 'painted') {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 64, 64);
    } else if (wallType === 'wood-panel') {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 64, 64);
        ctx.strokeStyle = '#6A4A2B';
        ctx.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(i * 16, 0);
            ctx.lineTo(i * 16, 64);
            ctx.stroke();
        }
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.8
    });
    const sample = new THREE.Mesh(geo, mat);
    sample.position.set(x, y, z);
    sample.castShadow = true;
    sample.userData = { type: 'wallSample', wallType: wallType };
    sample.name = 'settingsItem';
    interiorGroup.add(sample);
    settingsPanels.push(sample);
}

function createFridgeTypeOption(x, y, z, fridgeType, label) {
    // Create a small box representing fridge style
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Background
    const bgColors = {
        classic: '#E8E8E8',
        modern: '#333333',
        retro: '#7ED9C8'
    };
    ctx.fillStyle = bgColors[fridgeType] || '#999';
    ctx.fillRect(0, 0, 128, 128);
    
    // Draw mini fridge icon
    ctx.fillStyle = fridgeType === 'modern' ? '#555' : '#BBB';
    ctx.fillRect(40, 30, 48, 68);
    
    // Handle
    ctx.fillStyle = '#888';
    ctx.fillRect(80, 60, 4, 20);
    
    // Label
    ctx.fillStyle = fridgeType === 'modern' ? '#FFF' : '#333';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, 64, 118);
    
    const texture = new THREE.CanvasTexture(canvas);
    const geo = new THREE.BoxGeometry(0.45, 0.35, 0.25);
    const materials = [
        new THREE.MeshStandardMaterial({ color: 0x444444 }),
        new THREE.MeshStandardMaterial({ color: 0x444444 }),
        new THREE.MeshStandardMaterial({ color: 0x444444 }),
        new THREE.MeshStandardMaterial({ color: 0x444444 }),
        new THREE.MeshStandardMaterial({ map: texture }),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
    ];
    const box = new THREE.Mesh(geo, materials);
    box.position.set(x, y, z);
    box.castShadow = true;
    box.userData = { type: 'fridgeType', fridgeType: fridgeType, label: label };
    box.name = 'settingsItem';
    interiorGroup.add(box);
    settingsPanels.push(box);
}

// Handle clicks on settings items
function handleSettingsClick(intersects) {
    for (const hit of intersects) {
        if (hit.object.userData.type === 'colorSwatch') {
            const color = hit.object.userData.color;
            document.documentElement.style.setProperty('--fridge-color', '#' + color.toString(16).padStart(6, '0'));
            // Update 3D fridge color
            doorMesh.material.color.setHex(color);
            return true;
        }
        if (hit.object.userData.type === 'sceneSelector') {
            const sceneType = hit.object.userData.sceneType;
            const outdoorScene = document.getElementById('outdoorScene');
            if (outdoorScene) {
                outdoorScene.className = 'outdoor-scene ' + sceneType;
            }
            return true;
        }
        if (hit.object.userData.type === 'wallSample') {
            const wallType = hit.object.userData.wallType;
            const wallLayer = document.getElementById('wallLayer');
            if (wallLayer) {
                wallLayer.className = 'wall-layer ' + wallType;
            }
            return true;
        }
        if (hit.object.userData.type === 'fridgeType') {
            const fridgeType = hit.object.userData.fridgeType;
            console.log('Selected fridge type:', fridgeType);
            // Future: swap fridge model based on type
            alert(`Fridge type "${fridgeType}" selected. (More styles coming soon!)`);
            return true;
        }
    }
    return false;
}

// === 3D MAGNET SYSTEM ===
// Creates magnets as textured planes attached to the fridge door surface

function add3DMagnet(imageUrl, magnetId, posX = 0, posY = 0, rotation = 0, caption = '') {
    // Update magnet count display
    updateMagnetCountDisplay();

    const loader = new THREE.TextureLoader();
    loader.load(imageUrl, (texture) => {
        // High quality texture settings
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy(); // Max anisotropic filtering
        texture.colorSpace = THREE.SRGBColorSpace; // Correct color space
        
        // Calculate aspect ratio
        const aspectRatio = texture.image.width / texture.image.height;
        const magnetHeight = 0.6; // Fixed height in 3D units
        const magnetWidth = magnetHeight * aspectRatio;

        // Create magnet group to hold all parts
        const magnetGroup = new THREE.Group();

        // Create photo plane - use BasicMaterial for full brightness (no lighting)
        const magnetGeo = new THREE.PlaneGeometry(magnetWidth, magnetHeight);
        const magnetMat = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.DoubleSide
        });

        const magnetPlane = new THREE.Mesh(magnetGeo, magnetMat);
        magnetPlane.position.z = 0.01; // Increased from 0.005 to avoid z-fighting
        magnetPlane.name = 'magnetPhoto';
        magnetPlane.userData.caption = caption;
        magnetGroup.add(magnetPlane);
        
        // Add polaroid-style frame (white border) - use BasicMaterial
        const frameGeo = new THREE.PlaneGeometry(magnetWidth + 0.06, magnetHeight + 0.1);
        const frameMat = new THREE.MeshBasicMaterial({
            color: 0xFFFFFF,
            side: THREE.DoubleSide
        });
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.z = 0.002; // Clear separation from shadow
        frame.position.y = -0.02; // Slight offset for polaroid look
        frame.name = 'magnetFrame';
        magnetGroup.add(frame);

        // Add shadow behind frame
        const shadowGeo = new THREE.PlaneGeometry(magnetWidth + 0.12, magnetHeight + 0.16);
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide
        });
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.position.z = -0.005; // Behind everything
        shadow.position.x = 0.02;
        shadow.position.y = -0.04;
        shadow.name = 'magnetShadow';
        magnetGroup.add(shadow);

        // === USER ICON MAGNET CLIP ===
        // Randomly choose top-left or top-right corner
        const clipOnRight = Math.random() > 0.5;
        const clipX = clipOnRight ? (magnetWidth / 2 - 0.02) : (-magnetWidth / 2 + 0.02);
        const clipY = magnetHeight / 2 + 0.02;

        // Create circular user icon magnet clip
        const clipCanvas = document.createElement('canvas');
        clipCanvas.width = 64;
        clipCanvas.height = 64;
        const ctx = clipCanvas.getContext('2d');
        
        // Magnet body (circular, metallic look)
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, '#E8E8E8');
        gradient.addColorStop(0.5, '#C0C0C0');
        gradient.addColorStop(0.8, '#A0A0A0');
        gradient.addColorStop(1, '#808080');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(32, 32, 30, 0, Math.PI * 2);
        ctx.fill();
        
        // Inner circle border
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(32, 32, 28, 0, Math.PI * 2);
        ctx.stroke();

        // User initial (first letter of username)
        const username = localStorage.getItem('username') || 'U';
        const initial = username.charAt(0).toUpperCase();
        ctx.fillStyle = '#333';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initial, 32, 32);

        const clipTexture = new THREE.CanvasTexture(clipCanvas);
        const clipGeo = new THREE.CircleGeometry(0.08, 32); // More segments for smooth circle
        const clipMat = new THREE.MeshBasicMaterial({
            map: clipTexture,
            side: THREE.DoubleSide
        });
        const clip = new THREE.Mesh(clipGeo, clipMat);
        clip.position.set(clipX, clipY, 0.02); // Increased from 0.015 to avoid layer conflict
        magnetGroup.add(clip);

        // Add small 3D depth to clip (cylinder behind circle)
        const clipDepthGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 24);
        const clipDepthMat = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.5,
            metalness: 0.4
        });
        const clipDepth = new THREE.Mesh(clipDepthGeo, clipDepthMat);
        clipDepth.rotation.x = Math.PI / 2;
        clipDepth.position.set(clipX, clipY, 0.005);
        magnetGroup.add(clipDepth);

        // Position the magnet group on the door
        const doorWidth = FRIDGE_WIDTH - 0.4;
        const doorHeight = FRIDGE_HEIGHT - 0.4;
        
        const localX = (posX / 200) * (doorWidth / 2);
        const localY = (posY / 300) * (doorHeight / 2);
        
        magnetGroup.position.x = FRIDGE_WIDTH / 2 + localX;
        magnetGroup.position.y = localY;
        magnetGroup.position.z = DOOR_THICKNESS + 0.025;
        magnetGroup.rotation.z = (rotation * Math.PI) / 180;
        
        // Store metadata on group
        magnetGroup.userData = {
            type: 'magnet',
            magnetId: magnetId,
            caption: caption,
            posX: posX,
            posY: posY,
            rotation: rotation,
            originalScale: 1,
            isZoomed: false
        };
        magnetGroup.name = 'magnet';

        doorPivot.add(magnetGroup);
        magnetMeshes.push(magnetGroup);
        updateMagnetCountDisplay();

        console.log('Added 3D magnet with clip:', magnetId, 'Total:', magnetMeshes.length);
    }, undefined, (error) => {
        console.error('Error loading magnet texture:', error);
    });
}

function remove3DMagnet(magnetId) {
    const index = magnetMeshes.findIndex(m => m.userData.magnetId === magnetId);
    if (index !== -1) {
        const magnetGroup = magnetMeshes[index];
        
        // Dispose all children
        magnetGroup.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
            }
        });
        
        doorPivot.remove(magnetGroup);
        magnetMeshes.splice(index, 1);
        updateMagnetCountDisplay();
        console.log('Removed 3D magnet:', magnetId);
        return true;
    }
    return false;
}

function update3DMagnetPosition(magnetId, posX, posY, rotation) {
    const magnet = magnetMeshes.find(m => m.userData.magnetId === magnetId);
    if (magnet) {
        const doorWidth = FRIDGE_WIDTH - 0.4;
        const doorHeight = FRIDGE_HEIGHT - 0.4;
        
        const localX = (posX / 200) * (doorWidth / 2);
        const localY = (posY / 300) * (doorHeight / 2);
        
        magnet.position.x = FRIDGE_WIDTH / 2 + localX;
        magnet.position.y = localY;
        magnet.rotation.z = (rotation * Math.PI) / 180;
        
        magnet.userData.posX = posX;
        magnet.userData.posY = posY;
        magnet.userData.rotation = rotation;
    }
}

// Load magnets from server data
function load3DMagnetsFromData(magnets) {
    // Clear existing magnets
    magnetMeshes.forEach(m => {
        doorPivot.remove(m);
        m.geometry.dispose();
        m.material.dispose();
    });
    magnetMeshes = [];

    // Add new magnets
    magnets.forEach(magnet => {
        const mediaUrl = `http://localhost:3000/uploads/${magnet.file_path}`;
        add3DMagnet(mediaUrl, magnet.id, magnet.position_x, magnet.position_y, magnet.rotation, magnet.caption);
    });
}

// Expose functions globally for script.js
window.add3DMagnet = add3DMagnet;
window.remove3DMagnet = remove3DMagnet;
window.update3DMagnetPosition = update3DMagnetPosition;
window.load3DMagnetsFromData = load3DMagnetsFromData;
window.getMagnetMeshes = () => magnetMeshes;

// Handle file drops directly on 3D canvas
async function handleFileDrop(event) {
    event.preventDefault();
    if (isDoorOpen) return; // Don't add magnets when fridge is open
    
    const files = event.dataTransfer.files;
    if (files.length === 0) return;
    
    const sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
        alert('Please log in first');
        return;
    }
    
    for (const file of files) {
        if (!file.type.startsWith('image/')) {
            alert('Only images are supported for 3D magnets');
            continue;
        }
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('caption', file.name);
        formData.append('positionX', (Math.random() * 100 - 50));
        formData.append('positionY', (Math.random() * 150 - 75));
        formData.append('rotation', Math.random() * 30 - 15);
        
        try {
            const response = await fetch('http://localhost:3000/api/magnets', {
                method: 'POST',
                headers: { 'X-Session-Id': sessionId },
                body: formData
            });
            
            const data = await response.json();
            
            if (response.ok) {
                const mediaUrl = `http://localhost:3000/uploads/${data.filePath}`;
                add3DMagnet(mediaUrl, data.id, data.positionX, data.positionY, data.rotation, data.caption);
            } else {
                alert(data.error);
            }
        } catch (err) {
            console.error('Upload error:', err);
            alert('Failed to upload. Make sure backend is running.');
        }
    }
}
