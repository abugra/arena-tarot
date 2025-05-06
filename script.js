// Are.na API configuration
const ARENA_API_BASE = 'https://api.are.na/v2';

// State management
let cards = [];
let revealedCardCount = 0;  // Track how many cards have been revealed
const MAX_REVEALED_CARDS = 3;  // Maximum number of cards that can be revealed (still 3)

// Three.js variables
let scene, camera, renderer;
let cardMeshes = [];
let raycaster, mouse;
let cardTextures = [];
let cardBackTexture;
let animating = false;
let hoveredCard = null; // Track which card is currently being hovered

// Variables for drag detection
let isDragging = false;
let mouseDownTime = 0;
let mouseDownPosition = { x: 0, y: 0 };

// Initialize the application
async function init() {
    try {
        await fetchRandomContent();
        initThreeJS();
        setupEventListeners();
        
        // Reset card counter
        revealedCardCount = 0;
        
        // Initially hide reset button
        const resetContainer = document.querySelector('.reset-container');
        if (resetContainer) {
            resetContainer.classList.remove('visible');
        }
    } catch (error) {
        console.error('Initialization failed:', error);
        // Retry initialization after a short delay
        setTimeout(init, 1000);
    }
}

// Get random letter for search
function getRandomLetter() {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    return letters[Math.floor(Math.random() * letters.length)];
}

// Check if content has a valid image
function hasValidImage(content) {
    return content.image && 
           content.image.display && 
           content.image.display.url;
}

// Fetch random content from Are.na
async function fetchRandomContent() {
    try {
        // Get random letter and search
        const randomLetter = getRandomLetter();
        const searchResponse = await fetch(`${ARENA_API_BASE}/search?q=${randomLetter}&per=100`);
        const searchData = await searchResponse.json();
        
        if (!searchData.blocks || !Array.isArray(searchData.blocks)) {
            throw new Error('Invalid search data received');
        }

        // Filter for blocks with valid images
        cards = searchData.blocks
            .filter(hasValidImage)
            .map(content => ({
                ...content,
                position: Math.random()
            }))
            .sort((a, b) => a.position - b.position);

        // If no cards found, try another letter
        if (cards.length === 0) {
            console.log('No images found, trying another letter...');
            return fetchRandomContent();
        }
            
    } catch (error) {
        console.error('Error fetching content:', error);
        throw error; // Re-throw to trigger retry in init()
    }
}

// Initialize Three.js scene
function initThreeJS() {
    // Set up scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010101);
    
    // Set up camera
    const containerEl = document.getElementById('canvas-container');
    const aspectRatio = containerEl.clientWidth / containerEl.clientHeight;
    camera = new THREE.PerspectiveCamera(-20, aspectRatio, 0.1, 1000); // Smaller FOV for more zoom
    camera.position.set(0, 8, 14); // Closer to the cards
    camera.lookAt(0, 0, 0);
    
    // Set up renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerEl.appendChild(renderer.domElement);
    
    // Set up raycaster for mouse interactions
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 5, 3);
    scene.add(directionalLight);
    
    // Load tarot.png as card back texture - completely basic approach
    const textureLoader = new THREE.TextureLoader();
    textureLoader.load('tarot.png', texture => {
        // Basic settings, no transformations
        cardBackTexture = texture;
        createCards();
    }, undefined, error => {
        console.error('Error loading tarot.png:', error);
        // Simple red color texture as fallback
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 768;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        cardBackTexture = new THREE.CanvasTexture(canvas);
        createCards();
    });
    
    // Start animation loop
    animate();
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

// Create the cards laid out on a flat surface
function createCards() {
    // Create a simple box geometry for cards with minimal thickness
    const cardGeometry = new THREE.BoxGeometry(2.2, 3.7, 0.05); // Larger cards (was 1.5, 2.5)
    
    // Create 4 cards arranged in a single row (instead of 6)
    const numCards = 4;
    const spacing = 0.7; // Slightly more space between larger cards (was 0.6)
    
    // Calculate total width of the row
    const totalWidth = numCards * (2.2 + spacing) - spacing;
    
    // Create and position cards
    for (let i = 0; i < numCards; i++) {
        // Create a group to hold the card
        const cardGroup = new THREE.Group();
        
        // Create front and back materials
        const frontMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff, // White front (will be replaced with Arena image)
            side: THREE.FrontSide
        });
        
        const backMaterial = new THREE.MeshBasicMaterial({
            map: cardBackTexture,
            side: THREE.FrontSide
        });
        
        // Create a simple edge material
        const edgeMaterial = new THREE.MeshBasicMaterial({
            color: 0xeeeeee,
            side: THREE.FrontSide
        });
        
        // Create materials array for the box
        const materials = [
            edgeMaterial, // right side
            edgeMaterial, // left side
            edgeMaterial, // top edge
            edgeMaterial, // bottom edge
            frontMaterial, // front face (facing down initially)
            backMaterial  // back face (facing up initially)
        ];
        
        // Create the card mesh
        const cardMesh = new THREE.Mesh(cardGeometry, materials);
        cardMesh.name = "Card_" + i;
        
        // Calculate position - arrange in a single row
        const x = i * (2.2 + spacing) - totalWidth / 2 + 2.2/2;
        
        // Position card face down on the "table"
        cardGroup.position.set(x, 0, 0);
        
        // Rotate card to face down with tarot back facing up
        // We'll flip the card 180 degrees around X axis
        cardGroup.rotation.x = Math.PI; // 180 degrees around X axis
        
        cardGroup.name = "CardGroup_" + i;
        
        // Add the card to the group
        cardGroup.add(cardMesh);
        
        // Store metadata in the group's userData
        cardGroup.userData = { 
            id: i,
            flipped: false,
            selected: false,
            revealed: false,  // Card starts as not revealed
            cardMesh: cardMesh  // Keep reference to actual mesh for texture updates
        };
        
        // Also store parent reference in the mesh
        cardMesh.userData = {
            parentGroup: cardGroup,
            frontMaterial: frontMaterial,
            backMaterial: backMaterial
        };
        
        scene.add(cardGroup);
        cardMeshes.push(cardGroup);
    }
    
    console.log("Created cards:", cardMeshes);
    
    // Animation to introduce cards
    animateCardsEntry();
}

// Animate cards entry
function animateCardsEntry() {
    animating = true;
    
    cardMeshes.forEach((cardGroup, i) => {
        // Start cards from above
        cardGroup.position.y = 5;
        
        // Animate each card with a delay
        setTimeout(() => {
            // Use GSAP-like animation with simple interpolation
            const startY = cardGroup.position.y;
            const targetY = 0;
            const duration = 600;
            const startTime = Date.now();
            
            function updateCardPosition() {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                // Easing function (ease-out)
                const easedProgress = 1 - Math.pow(1 - progress, 3);
                
                // Update position
                cardGroup.position.y = startY + (targetY - startY) * easedProgress;
                
                if (progress < 1) {
                    requestAnimationFrame(updateCardPosition);
                } else if (i === cardMeshes.length - 1) {
                    animating = false;
                }
            }
            
            updateCardPosition();
        }, i * 150);
    });
}

// Handle window resize
function onWindowResize() {
    const containerEl = document.getElementById('canvas-container');
    const width = containerEl.clientWidth;
    const height = containerEl.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

// Flip a card and show image
function flipCard(cardIndex) {
    if (animating) return;
    
    const cardGroup = cardMeshes[cardIndex];
    if (!cardGroup) {
        console.error("Card group not found:", cardIndex);
        return;
    }
    
    // Check if card is already revealed (one-time only)
    if (cardGroup.userData.revealed) {
        console.log("Card already revealed, no further interaction");
        return;
    }
    
    // Check if maximum number of cards have been revealed
    if (revealedCardCount >= MAX_REVEALED_CARDS) {
        console.log("Maximum number of cards already revealed");
        // Instead of showing refresh message, highlight the reset button
        highlightResetButton();
        return;
    }
    
    // Get the actual card mesh
    const cardMesh = cardGroup.userData.cardMesh;
    if (!cardMesh) {
        console.error("Card mesh not found in group:", cardGroup.name);
        return;
    }
    
    // Mark card as selected and permanently revealed
    cardGroup.userData.selected = true;
    cardGroup.userData.revealed = true;
    
    // Increment the revealed card counter
    revealedCardCount++;
    
    // Get the appropriate label based on revealed count
    let label;
    switch (revealedCardCount) {
        case 1:
            label = "Past";
            break;
        case 2:
            label = "Present";
            break;
        case 3:
            label = "Future";
            break;
        default:
            label = "";
    }
    
    // Get a random card from our API cards
    const randomIndex = Math.floor(Math.random() * cards.length);
    const cardData = cards[randomIndex];
    
    // Load the image texture
    if (cardData && cardData.image && cardData.image.display && cardData.image.display.url) {
        const imageUrl = cardData.image.display.url;
        console.log("Loading image:", imageUrl);
        
        loadCardTexture(imageUrl).then(texture => {
            console.log("Texture loaded successfully");
            
            // Store the card's current texture to use when flipping
            cardGroup.userData.targetTexture = texture;
            cardGroup.userData.label = label;  // Store the label
            
            // Start the flip animation - the texture will be set halfway through
            animateCardFlip(cardGroup);
            
            // Check if we've reached the limit after successful flip
            if (revealedCardCount >= MAX_REVEALED_CARDS) {
                setTimeout(() => {
                    // Instead of showing refresh message, highlight the reset button
                    highlightResetButton();
                }, 1000); // Wait for flip animation to complete
            }
        }).catch(error => {
            console.error('Error loading texture:', error);
            cardGroup.userData.revealed = false; // Reset selection on error
            cardGroup.userData.selected = false;
            revealedCardCount--; // Decrement counter on failure
        });
    } else {
        console.error("No valid image found in card data");
        cardGroup.userData.revealed = false; // Reset selection
        cardGroup.userData.selected = false;
        revealedCardCount--; // Decrement counter on failure
    }
}

// Load a texture from URL - simple, basic approach
function loadCardTexture(url) {
    return new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(
            url,
            texture => resolve(texture),
            undefined,
            error => reject(error)
        );
    });
}

// Animate card flip
function animateCardFlip(cardGroup) {
    animating = true;
    
    const startRotX = cardGroup.rotation.x;
    const targetRotX = 0; // Flip to face up (0 degrees)
    const duration = 800;
    const startTime = Date.now();
    
    // Get the card mesh
    const cardMesh = cardGroup.userData.cardMesh;
    
    // The texture to apply halfway through the animation
    const targetTexture = cardGroup.userData.targetTexture;
    let textureChanged = false;
    
    // Get the label for this card
    const label = cardGroup.userData.label;
    
    function updateCardRotation() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Easing function (ease-in-out)
        const easedProgress = progress < 0.5
            ? 2 * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        // Update rotation
        cardGroup.rotation.x = startRotX + (targetRotX - startRotX) * easedProgress;
        
        // When card is perpendicular to camera (halfway through animation),
        // change the texture
        if (progress >= 0.5 && !textureChanged && targetTexture) {
            // Update the front face material (index 4 in the materials array)
            if (Array.isArray(cardMesh.material) && cardMesh.material.length > 4) {
                // Fix the texture rotation before applying it
                targetTexture.center.set(0.5, 0.5);
                targetTexture.rotation = Math.PI; // Rotate 180 degrees to fix orientation
                targetTexture.needsUpdate = true;
                
                // Now apply the rotated texture
                cardMesh.material[4].map = targetTexture;
                cardMesh.material[4].needsUpdate = true;
            } else {
                console.error("Card material structure not as expected");
            }
            
            textureChanged = true;
            console.log("Changed texture during flip animation");
        }
        
        if (progress < 1) {
            requestAnimationFrame(updateCardRotation);
        } else {
            animating = false;
            
            // Animation is complete, add the label text
            if (label) {
                createLabelForCard(cardGroup, label);
            }
        }
    }
    
    updateCardRotation();
}

// Create a mystical label beneath the card
function createLabelForCard(cardGroup, text) {
    // Cleanup any existing label
    cardGroup.children.forEach(child => {
        if (child.isTextLabel) {
            cardGroup.remove(child);
        }
    });
    
    // Create canvas for the text
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    
    // Set up gradient background
    const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.2, 'rgba(138, 43, 226, 0.7)'); // BlueViolet with transparency
    gradient.addColorStop(0.8, 'rgba(138, 43, 226, 0.7)'); // BlueViolet with transparency
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw the text
    context.font = 'bold 32px serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Add a glow effect
    context.shadowColor = 'gold';
    context.shadowBlur = 10;
    context.fillStyle = 'white';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    
    // Create a texture from the canvas
    const texture = new THREE.CanvasTexture(canvas);
    
    // Rotate the texture's UVs to fix the orientation
    texture.center.set(0.5, 0.5);
    texture.rotation = Math.PI; // Rotate 180 degrees to fix orientation
    texture.needsUpdate = true;
    
    // Create a material using the texture
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0 // Start invisible for animation
    });
    
    // Create a plane geometry for the label (larger to match larger cards)
    const geometry = new THREE.PlaneGeometry(2.2, 0.6);
    const labelMesh = new THREE.Mesh(geometry, material);
    labelMesh.isTextLabel = true;
    
    // Position the label beneath the card (adjusted for larger cards)
    labelMesh.position.y = -2.1;
    labelMesh.rotation.x = -Math.PI / 2; // Rotate to face up
    
    // Add the label to the card group
    cardGroup.add(labelMesh);
    
    // Animate the label appearing
    animateLabelAppearance(material);
}

// Animate the label appearing with a mystical effect
function animateLabelAppearance(material) {
    const duration = 1000; // 1 second for the animation
    const startTime = Date.now();
    
    function updateLabelOpacity() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Custom easing for mystical appearance
        // This creates a pulsing, glowing effect as it appears
        const easedProgress = Math.sin(progress * Math.PI / 2);
        const oscillation = 0.2 * Math.sin(progress * 10) * (1 - progress);
        
        // Set the opacity with oscillation for a mystical effect
        material.opacity = easedProgress + oscillation;
        material.needsUpdate = true;
        
        if (progress < 1) {
            requestAnimationFrame(updateLabelOpacity);
        }
    }
    
    updateLabelOpacity();
}

// Highlight reset button when all cards are revealed
function highlightResetButton() {
    const resetButton = document.getElementById('reset-button');
    const resetContainer = document.querySelector('.reset-container');
    
    if (resetContainer) {
        // Make container visible
        resetContainer.classList.add('visible');
    }
    
    if (resetButton) {
        resetButton.classList.add('highlight');
        // Add a pulsing animation
        resetButton.style.animation = 'pulse 1.5s infinite';
    }
}

// Reset the tarot reading
function resetTarotReading() {
    // Only allow reset if not currently animating
    if (animating) return;
    
    // Start animation
    animating = true;
    
    // Remove highlight from reset button
    const resetButton = document.getElementById('reset-button');
    if (resetButton) {
        resetButton.classList.remove('highlight');
        resetButton.style.animation = '';
    }
    
    // Hide reset container after animation completes
    const resetContainer = document.querySelector('.reset-container');
    
    // First, animate all cards flipping back down
    const promises = [];
    
    cardMeshes.forEach((cardGroup) => {
        // Only animate cards that were flipped
        if (cardGroup.userData.revealed) {
            const promise = new Promise((resolve) => {
                // Flip animation
                const startRotX = cardGroup.rotation.x;
                const targetRotX = Math.PI; // 180 degrees (face down)
                const duration = 600;
                const startTime = Date.now();
                
                function updateCardRotation() {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    // Easing function (ease-in-out)
                    const easedProgress = progress < 0.5
                        ? 2 * progress * progress
                        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
                    
                    // Update rotation
                    cardGroup.rotation.x = startRotX + (targetRotX - startRotX) * easedProgress;
                    
                    if (progress < 1) {
                        requestAnimationFrame(updateCardRotation);
                    } else {
                        // Reset card data
                        cardGroup.userData.revealed = false;
                        cardGroup.userData.selected = false;
                        
                        // Remove any labels
                        cardGroup.children.forEach(child => {
                            if (child.isTextLabel) {
                                cardGroup.remove(child);
                            }
                        });
                        
                        resolve();
                    }
                }
                
                // Start the card flip animation with slight delay based on index
                setTimeout(() => {
                    updateCardRotation();
                }, cardMeshes.indexOf(cardGroup) * 200);
            });
            
            promises.push(promise);
        }
    });
    
    // When all cards are flipped back down, reset counter and fetch new content
    Promise.all(promises).then(() => {
        // Reset counter
        revealedCardCount = 0;
        
        // Hide reset container
        if (resetContainer) {
            resetContainer.classList.remove('visible');
        }
        
        // Fetch new content from Are.na
        fetchRandomContent().then(() => {
            animating = false;
        }).catch(error => {
            console.error('Error fetching new content:', error);
            animating = false;
        });
    });
}

// Setup event listeners
function setupEventListeners() {
    const containerEl = document.getElementById('canvas-container');
    
    // Add reset button event listener
    const resetButton = document.getElementById('reset-button');
    if (resetButton) {
        resetButton.addEventListener('click', resetTarotReading);
    }
    
    // Store a reference to original click handler
    const clickHandler = event => {
        if (animating) return;
        
        // Calculate mouse position in normalized device coordinates
        const rect = containerEl.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / containerEl.clientWidth) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / containerEl.clientHeight) * 2 + 1;
        
        // Cast a ray from the camera to the mouse position
        raycaster.setFromCamera(mouse, camera);
        
        // Get all meshes from the card groups for intersection testing
        const allCardMeshes = [];
        cardMeshes.forEach(cardGroup => {
            cardGroup.traverse(child => {
                if (child.isMesh) {
                    // Store the reference to parent group in the mesh
                    child.userData.parentGroup = cardGroup;
                    allCardMeshes.push(child);
                }
            });
        });
        
        // Check for intersections with the card meshes
        const intersects = raycaster.intersectObjects(allCardMeshes);
        
        if (intersects.length > 0) {
            // Get the parent group of the intersected mesh
            const intersectedGroup = intersects[0].object.userData.parentGroup;
            const cardIndex = cardMeshes.indexOf(intersectedGroup);
            
            if (cardIndex !== -1) {
                flipCard(cardIndex);
            }
        }
    };
    
    // Mouse down event to track start of potential drag
    containerEl.addEventListener('mousedown', event => {
        mouseDownTime = Date.now();
        mouseDownPosition = {
            x: event.clientX,
            y: event.clientY
        };
        isDragging = false;
    });
    
    // Mouse move event to detect dragging
    containerEl.addEventListener('mousemove', event => {
        if (animating) return;
        
        // If mouse is down and moving, consider it a drag
        if (mouseDownTime > 0) {
            const dx = Math.abs(event.clientX - mouseDownPosition.x);
            const dy = Math.abs(event.clientY - mouseDownPosition.y);
            
            // If moved more than 5 pixels, consider it a drag
            if (dx > 5 || dy > 5) {
                isDragging = true;
            }
        }
        
        // Calculate mouse position in normalized device coordinates
        const rect = containerEl.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / containerEl.clientWidth) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / containerEl.clientHeight) * 2 + 1;
        
        // Cast a ray from the camera to the mouse position
        raycaster.setFromCamera(mouse, camera);
        
        // Get all meshes from the card groups for intersection testing
        const allCardMeshes = [];
        cardMeshes.forEach(cardGroup => {
            cardGroup.traverse(child => {
                if (child.isMesh) {
                    child.userData.parentGroup = cardGroup;
                    allCardMeshes.push(child);
                }
            });
        });
        
        // Check for intersections with the card meshes
        const intersects = raycaster.intersectObjects(allCardMeshes);
        
        const containerElement = document.getElementById('canvas-container');
        
        if (intersects.length > 0) {
            // Get the parent group of the intersected mesh
            const intersectedGroup = intersects[0].object.userData.parentGroup;
            
            // Change cursor to pointer
            containerElement.style.cursor = 'pointer';
            
            // If we're hovering a new card, reset the old one
            if (hoveredCard && hoveredCard !== intersectedGroup) {
                // Reset scale of previously hovered card
                gsapLikeScale(hoveredCard, 1, 1, 1);
                hoveredCard = null;
            }
            
            // If we haven't set this card as hovered yet, apply the scale
            if (hoveredCard !== intersectedGroup) {
                hoveredCard = intersectedGroup;
                // Scale up the hovered card by 2%
                gsapLikeScale(hoveredCard, 1.02, 1.02, 1.02);
            }
        } else {
            // No card hovered, change cursor back to default
            containerElement.style.cursor = 'default';
            
            // Reset scale of previously hovered card if any
            if (hoveredCard) {
                gsapLikeScale(hoveredCard, 1, 1, 1);
                hoveredCard = null;
            }
        }
    });
    
    // Mouse up event to process clicks
    containerEl.addEventListener('mouseup', event => {
        // Only process click if not dragging and not too long after mousedown
        const clickDuration = Date.now() - mouseDownTime;
        const isClick = !isDragging && clickDuration < 300; // Consider it a click if less than 300ms
        
        if (isClick) {
            // Process the click using same logic as the click handler
            clickHandler(event);
        }
        
        // Reset drag detection variables
        mouseDownTime = 0;
        isDragging = false;
    });
    
    // Add click handler directly for mobile and as a fallback
    containerEl.addEventListener('click', clickHandler);
    
    // Add mouseleave event to reset hover state when cursor leaves the container
    containerEl.addEventListener('mouseleave', () => {
        if (hoveredCard) {
            gsapLikeScale(hoveredCard, 1, 1, 1);
            hoveredCard = null;
        }
        containerEl.style.cursor = 'default';
        
        // Reset drag detection variables
        mouseDownTime = 0;
        isDragging = false;
    });
}

// Helper function for smooth scaling (GSAP-like)
function gsapLikeScale(object, targetX, targetY, targetZ) {
    const startScale = {
        x: object.scale.x,
        y: object.scale.y,
        z: object.scale.z
    };
    const targetScale = { x: targetX, y: targetY, z: targetZ };
    const duration = 200; // milliseconds
    const startTime = Date.now();
    
    function updateScale() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Easing function (ease-out)
        const easedProgress = 1 - Math.pow(1 - progress, 2);
        
        // Update scale
        object.scale.x = startScale.x + (targetScale.x - startScale.x) * easedProgress;
        object.scale.y = startScale.y + (targetScale.y - startScale.y) * easedProgress;
        object.scale.z = startScale.z + (targetScale.z - startScale.z) * easedProgress;
        
        if (progress < 1) {
            requestAnimationFrame(updateScale);
        }
    }
    
    updateScale();
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', init); 