// Are.na API configuration
const ARENA_API_BASE = 'https://api.are.na/v2';

// State management
let cards = [];
let revealedCardCount = 0;  // Track how many cards have been revealed
const MAX_REVEALED_CARDS = 3;  // Maximum number of cards that can be revealed (still 3)
let queries = []; // Will store queries loaded from data.json

// Three.js variables
let scene, camera, renderer;
let cardMeshes = [];
let raycaster, mouse;
let cardTextures = [];
let cardBackTexture;
let animating = false;
let hoveredCard = null; // Track which card is currently being hovered

// Variables for shuffle animation
let shuffleCards = [];
let isInitialAnimation = true;

// Variables for drag detection
let isDragging = false;
let mouseDownTime = 0;
let mouseDownPosition = { x: 0, y: 0 };

// UI elemanlarını (başlık, açıklama ve footer) göster
function showUIElements() {
    const header = document.querySelector('header');
    const footer = document.querySelector('.footer');
    
    if (header) {
        header.classList.add('visible');
    }
    
    if (footer) {
        footer.classList.add('visible');
    }
}

// UI elemanlarını gizle
function hideUIElements() {
    const header = document.querySelector('header');
    const footer = document.querySelector('.footer');
    
    if (header) {
        header.classList.remove('visible');
    }
    
    if (footer) {
        footer.classList.remove('visible');
    }
}

// Initialize the application
async function init() {
    try {
        // Sayfa başlangıcında UI elemanlarını gizle
        hideUIElements();
        
        // Load queries from data.json
        await loadQueriesFromJson();
        
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

// Load queries from data.json
async function loadQueriesFromJson() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error('Failed to load data.json');
        }
        
        const data = await response.json();
        
        // Flatten all query categories into a single array
        queries = Object.values(data).flat();
        
        if (queries.length === 0) {
            throw new Error('No queries found in data.json');
        }
        
        console.log(`Loaded ${queries.length} queries from data.json`);
        return true;
    } catch (error) {
        console.error('Error loading queries from data.json:', error);
        // Fallback to some default queries if data.json fails
        queries = ['art', 'design', 'photography', 'architecture', 'nature'];
        return false;
    }
}

// Get random query from loaded queries
function getRandomQuery() {
    if (queries.length === 0) {
        return 'art'; // Fallback if no queries loaded
    }
    return queries[Math.floor(Math.random() * queries.length)];
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
        // Get random query from data.json instead of random letter
        const randomQuery = getRandomQuery();
        
        const searchResponse = await fetch(`${ARENA_API_BASE}/search?q=${encodeURIComponent(randomQuery)}&per=100`);
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

        // If no cards found, try another query
        if (cards.length === 0) {
            return fetchRandomContent();
        }
        
        return true;
            
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
    camera = new THREE.PerspectiveCamera(-25, aspectRatio, 0.1, 1000); // Daha geniş FOV
    camera.position.set(0, 12, 16); // Daha uzakta ve biraz daha yüksekte
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
        
        if (isInitialAnimation) {
            // Create shuffling animation first
            createShuffleAnimation();
        } else {
            // Skip animation and create cards directly
            createCards();
        }
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

// Create shuffling animation with many cards
function createShuffleAnimation() {
    // Create a simple card geometry for cards with minimal thickness
    const cardGeometry = new THREE.BoxGeometry(2.2, 3.7, 0.05);
    
    // Number of cards in the shuffle animation
    const numShuffleCards = 60; // More cards for more impressive effect
    
    // Create edge and back materials
    const edgeMaterial = new THREE.MeshBasicMaterial({
        color: 0xeeeeee,
        side: THREE.FrontSide
    });
    
    const backMaterial = new THREE.MeshBasicMaterial({
        map: cardBackTexture,
        side: THREE.FrontSide
    });
    
    // Kozmik kartlar için basit renk dokuları oluştur
    const createRandomFrontTexture = () => {
        // Rastgele renk ve doku oluştur
        const randomHue = Math.random() * 360;
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 768;
        const ctx = canvas.getContext('2d');
        
        // Gradient arka plan
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, `hsl(${randomHue}, 70%, 40%)`);
        gradient.addColorStop(1, `hsl(${(randomHue + 40) % 360}, 80%, 30%)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Rastgele şekiller/desenler ekle
        for (let i = 0; i < 10; i++) {
            ctx.beginPath();
            ctx.fillStyle = `hsla(${(randomHue + 180) % 360}, 70%, 60%, 0.3)`;
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            const radius = 20 + Math.random() * 100;
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        return new THREE.CanvasTexture(canvas);
    };
    
    // Create materials array for the box
    const createMaterials = (index) => {
        // Kozmik kartlar için sadece rastgele doku oluştur, Are.na içeriği kullanma
        const frontTexture = createRandomFrontTexture();
        
        return [
            edgeMaterial, // right side
            edgeMaterial, // left side
            edgeMaterial, // top edge
            edgeMaterial, // bottom edge
            new THREE.MeshBasicMaterial({ map: frontTexture, side: THREE.FrontSide }), // front face
            backMaterial  // back face
        ];
    };
    
    // Create and position the shuffling cards in a cosmic formation
    for (let i = 0; i < numShuffleCards; i++) {
        // Create the card group
        const cardGroup = new THREE.Group();
        
        // Create the card mesh with materials
        const cardMesh = new THREE.Mesh(cardGeometry, createMaterials(i));
        cardMesh.name = "ShuffleCard_" + i;
        
        // Distribute cards in a spherical galaxy formation
        // Phi is the angle from the y-axis (0 to PI)
        const phi = Math.acos(-1 + (2 * i) / numShuffleCards);
        // Theta is the angle in the x-z plane (0 to 2*PI)
        const theta = Math.sqrt(numShuffleCards * Math.PI) * phi;
        
        // Apply Fibonacci sphere algorithm for even distribution
        const radius = 20;
        
        cardGroup.position.set(
            radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
        );
        
        // Point cards toward center
        cardGroup.lookAt(0, 0, 0);
        
        // Kartı döndürerek ön yüzü (rastgele doku) kameraya baksın
        cardMesh.rotation.y = Math.PI;
        
        // Add slight random rotation for variety
        cardGroup.rotation.z = Math.random() * Math.PI * 0.1;
        
        cardGroup.name = "ShuffleCardGroup_" + i;
        
        // Add card to group
        cardGroup.add(cardMesh);
        scene.add(cardGroup);
        
        // Store the card for animation
        shuffleCards.push(cardGroup);
        
        // Initial scale - cards will grow from small points
        cardGroup.scale.set(0.01, 0.01, 0.01);
    }
    
    // Start the cosmic animation
    animateCosmicShuffle();
}

// Animate the cosmic shuffle of cards
function animateCosmicShuffle() {
    animating = true;
    
    // First phase: cards appear from nothingness and form cosmic sphere
    const appearDuration = 3000;
    const appearStartTime = Date.now();
    
    function appearAnimation() {
        const elapsed = Date.now() - appearStartTime;
        const progress = Math.min(elapsed / appearDuration, 1);
        
        // Custom easing function for cosmic feeling
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        
        // For each card, grow and start orbiting
        shuffleCards.forEach((card, i) => {
            // Grow from small points to full size
            const scale = 0.01 + easedProgress * 0.99;
            card.scale.set(scale, scale, scale);
            
            // Orbit around center
            const orbitSpeed = 0.2 + (i % 5) * 0.1; // Different speeds
            const radius = card.position.length();
            
            // Original position normalized
            const normalizedPos = new THREE.Vector3(
                card.position.x / radius,
                card.position.y / radius,
                card.position.z / radius
            );
            
            // Rotate position around different axes
            const angle = progress * Math.PI * orbitSpeed;
            
            // Determine rotation axis based on card index
            let rotationAxis;
            if (i % 3 === 0) {
                // Rotate around y-axis
                rotationAxis = new THREE.Vector3(0, 1, 0);
            } else if (i % 3 === 1) {
                // Rotate around tilted axis
                rotationAxis = new THREE.Vector3(0.5, 1, 0.5).normalize();
            } else {
                // Rotate around z-axis
                rotationAxis = new THREE.Vector3(0, 0, 1);
            }
            
            // Apply rotation to position
            const rotatedPos = normalizedPos.clone().applyAxisAngle(rotationAxis, angle);
            
            // Update position
            card.position.set(
                rotatedPos.x * radius,
                rotatedPos.y * radius,
                rotatedPos.z * radius
            );
            
            // Keep cards facing center
            card.lookAt(0, 0, 0);
            
            // Add slight wobble to rotation
            card.rotation.z += Math.sin(progress * Math.PI * 10 + i) * 0.01;
        });
        
        if (progress < 1) {
            requestAnimationFrame(appearAnimation);
        } else {
            // When cosmic animation is complete, directly select four cards
            setTimeout(selectAndPlaceFourCards, 300);
        }
    }
    
    // Start the appearance animation
    appearAnimation();
    
    // Select four cards and place them in position
    function selectAndPlaceFourCards() {
        // Select 4 random cards from the cosmic formation to keep
        const numCardsToKeep = 4;
        const cardsToKeep = [];
        const cardsToRemove = [...shuffleCards]; // Start with all cards marked for removal
        
        // Calculate positions for the 4 cards
        const spacing = 1.2;
        const cardWidth = 2;
        const totalWidth = numCardsToKeep * (cardWidth + spacing) - spacing;
        
        // Final positions for the 4 cards from left to right
        const finalPositions = [];
        for (let i = 0; i < numCardsToKeep; i++) {
            finalPositions.push({
                x: i * (cardWidth + spacing) - totalWidth / 2 + cardWidth/2,
                y: 0,
                z: 0
            });
        }
        
        // Kozmik oluşumdan 4 adet rastgele kart seç
        for (let i = 0; i < numCardsToKeep; i++) {
            if (cardsToRemove.length > 0) {
                const randomIndex = Math.floor(Math.random() * cardsToRemove.length);
                const selectedCard = cardsToRemove.splice(randomIndex, 1)[0];
                
                // Seçilen kartı işaretle
                selectedCard.userData.positionIndex = i;
                selectedCard.userData.selected = true;
                
                // Seçilen kartı büyüt ve parlat (görsel gösterim) 
                selectedCard.scale.set(1.5, 1.5, 1.5); // Seçilmiş kartları büyüt
                
                // Kartın ön yüzünü gizle (kademeli olarak), tarot desenini göster
                // Kozmik kartlardan tarot düzenine geçişi sağlayacak
                if (selectedCard.children[0]) {
                    // Bir animasyon oluştur, ön yüzü kadameli olarak gizle
                    animateCardFlipToBack(selectedCard.children[0]);
                }
                
                cardsToKeep.push(selectedCard);
            }
        }
        
        // Tüm animasyonları aynı anda başlat
        
        // 1. Seçilmeyen kartların uçuş animasyonunu başlat
        cardsToRemove.forEach(card => {
            flyAwayCard(card);
        });
        
        // 2. Aynı anda seçilen kartları pozisyonlandır
        moveSelectedCardsToPosition(cardsToKeep);
    }
    
    // Kartın ön yüzünü arka yüze çeviren animasyon
    function animateCardFlipToBack(cardMesh) {
        const flipDuration = 800; // ms
        const flipStartTime = Date.now();
        const startRotY = cardMesh.rotation.y; // Başlangıç rotasyonu (genelde PI - ön yüz görünür)
        const targetRotY = 0; // Hedef rotasyon (0 - arka yüz görünür)
        
        function updateFlip() {
            const elapsed = Date.now() - flipStartTime;
            const progress = Math.min(elapsed / flipDuration, 1);
            
            // Yumuşak geçiş için easing fonksiyonu
            const easedProgress = 1 - Math.pow(1 - progress, 2);
            
            // Kartın Y ekseni rotasyonunu güncelle (ön yüzden arka yüze)
            cardMesh.rotation.y = startRotY + (targetRotY - startRotY) * easedProgress;
            
            if (progress < 1) {
                requestAnimationFrame(updateFlip);
            }
        }
        
        updateFlip();
    }
    
    // Function to make a card fly away
    function flyAwayCard(card, callback) {
        const flyDuration = 500 + Math.random() * 200; // Reduced from 700+300ms to 500+200ms
        const flyStartTime = Date.now();
        
        // Random target position off-screen
        const targetPos = {
            x: (Math.random() - 0.5) * 30,
            y: -10 - Math.random() * 5,
            z: (Math.random() - 0.5) * 30
        };
        
        const startPos = {
            x: card.position.x,
            y: card.position.y,
            z: card.position.z
        };
        
        function flyAway() {
            const elapsed = Date.now() - flyStartTime;
            const progress = Math.min(elapsed / flyDuration, 1);
            
            // Easing function
            const easedProgress = progress < 0.5
                ? 4 * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            
            // Update position
            card.position.x = startPos.x + (targetPos.x - startPos.x) * easedProgress;
            card.position.y = startPos.y + (targetPos.y - startPos.y) * easedProgress;
            card.position.z = startPos.z + (targetPos.z - startPos.z) * easedProgress;
            
            // Add some rotation
            card.rotation.x += 0.03;
            card.rotation.y += 0.02;
            card.rotation.z += 0.04;
            
            // Fade out by scaling down
            const fadeScale = 1 - easedProgress * 0.8;
            card.scale.set(fadeScale, fadeScale, fadeScale);
            
            if (progress < 1) {
                requestAnimationFrame(flyAway);
            } else {
                // Remove the card from the scene
                scene.remove(card);
                
                // İşlem tamamlandıysa callback'i çağır
                if (callback) callback();
            }
        }
        
        // Uçuş animasyonunu hemen başlat (gecikme olmadan)
        flyAway();
    }
    
    // Function to move selected cards to final position
    function moveSelectedCardsToPosition(selectedCards) {
        // Sort the cards by their position index to ensure they animate to correct positions
        selectedCards.sort((a, b) => a.userData.positionIndex - b.userData.positionIndex);
        
        // Tarot kartları için final pozisyonları tanımla
        const spacing = 1.2;
        const cardWidth = 2;
        const totalWidth = selectedCards.length * (cardWidth + spacing) - spacing;
        
        // Final positions for the cards from left to right
        const finalPositions = [];
        for (let i = 0; i < selectedCards.length; i++) {
            finalPositions.push({
                x: i * (cardWidth + spacing) - totalWidth / 2 + cardWidth/2,
                y: 0,
                z: 0
            });
        }
        
        // Seçilen kartlar için bir süre izle
        let animationsComplete = 0;
        const totalCards = selectedCards.length;
        
        // Animate the selected cards moving to their final positions
        selectedCards.forEach((card, i) => {
            // Animate card moving to final position based on its assigned position index
            const posIndex = card.userData.positionIndex;
            const moveDuration = 600; // Reduced from 1000ms to 600ms
            const moveStartTime = Date.now();
            
            const startPos = {
                x: card.position.x,
                y: card.position.y,
                z: card.position.z
            };
            
            const startRot = {
                x: card.rotation.x,
                y: card.rotation.y,
                z: card.rotation.z
            };
            
            // Başlangıç ölçeği (büyütülmüş kartlar normal boyuta dönecek)
            const startScale = {
                x: card.scale.x,
                y: card.scale.y,
                z: card.scale.z
            };
            
            // Kartın ön yüzünü gizle, arka yüzü göster (tarot deseni)
            if (card.children[0] && card.children[0].rotation) {
                // Kartın mesh'inin rotasyonunu sıfırla - artık ön yüzü (Are.na içeriği) görünmesin
                // Böylece arka yüzü (tarot deseni) görünecek
                card.children[0].rotation.y = 0;
            }
            
            function moveToPosition() {
                const elapsed = Date.now() - moveStartTime;
                const progress = Math.min(elapsed / moveDuration, 1);
                
                // Easing function for smooth movement
                const easedProgress = 1 - Math.pow(1 - progress, 3);
                
                // Arc motion for a more natural movement
                const arcHeight = 4 * Math.sin(progress * Math.PI);
                
                // Use the card's position index to determine its final position
                const finalPos = finalPositions[posIndex];
                
                // Update position with arc motion
                card.position.x = startPos.x + (finalPos.x - startPos.x) * easedProgress;
                card.position.y = startPos.y + (finalPos.y - startPos.y) * easedProgress + arcHeight;
                card.position.z = startPos.z + (finalPos.z - startPos.z) * easedProgress;
                
                // Update rotation to face down - kartın arka yüzü üstte olacak
                card.rotation.x = startRot.x + (Math.PI - startRot.x) * easedProgress;
                card.rotation.y = startRot.y + (0 - startRot.y) * easedProgress;
                card.rotation.z = startRot.z + (0 - startRot.z) * easedProgress;
                
                // Kartları normal boyuta getir (1.5'ten 1.0'a)
                const targetScale = 1.0;
                card.scale.x = startScale.x + (targetScale - startScale.x) * easedProgress;
                card.scale.y = startScale.y + (targetScale - startScale.y) * easedProgress;
                card.scale.z = startScale.z + (targetScale - startScale.z) * easedProgress;
                
                if (progress < 1) {
                    requestAnimationFrame(moveToPosition);
                } else {
                    // Her tamamlanan animasyonu say
                    animationsComplete++;
                    
                    // Tüm animasyonlar tamamlandığında kozmik kartları temizle
                    if (animationsComplete >= totalCards) {
                        // Asıl kartları şimdi oluştur
                        createCards();
                        
                        // Tüm kozmik kartları temizle
                        for (let i = shuffleCards.length - 1; i >= 0; i--) {
                            scene.remove(shuffleCards[i]);
                        }
                        // Diziyi boşalt
                        shuffleCards = [];
                        
                        // Animasyon tamamlandı
                        animating = false;
                        
                        // UI elemanlarını göster
                        showUIElements();
                    }
                }
            }
            
            // Start moving to position immediately
            moveToPosition();
        });
    }
}

// Create the cards laid out on a flat surface
function createCards() {
    // Create a simple box geometry for cards with minimal thickness
    const cardGeometry = new THREE.BoxGeometry(2, 3.5, 0.05); // Hafif küçültülmüş kartlar
    
    // Create 4 cards arranged in a single row (instead of 6)
    const numCards = 4;
    const spacing = 1.2; // Kartlar arası daha fazla boşluk
    
    // Calculate total width of the row
    const totalWidth = numCards * (2 + spacing) - spacing;
    
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
        const x = i * (2 + spacing) - totalWidth / 2 + 2/2;
        
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
            cardMesh: cardMesh,  // Keep reference to actual mesh for texture updates
            arenaUrl: null  // Initialize arenaUrl
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
    
    // Instead of animating cards entry, position them directly
    cardMeshes.forEach((cardGroup) => {
        // Set final position directly - no animation
        cardGroup.position.y = 0;
    });
    
    // Mark animation as complete
    animating = false;
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
        return;
    }
    
    // Check if maximum number of cards have been revealed
    if (revealedCardCount >= MAX_REVEALED_CARDS) {
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
    
    // Tıklandığında Are.na'dan içerik çek
    fetchSingleCardContent().then(cardData => {
        if (cardData && cardData.image && cardData.image.display && cardData.image.display.url) {
            const imageUrl = cardData.image.display.url;
            
            // Store the original Are.na URL
            const arenaUrl = `https://www.are.na/block/${cardData.id}`;
            cardGroup.userData.arenaUrl = arenaUrl;
            
            loadCardTexture(imageUrl).then(texture => {
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
    }).catch(error => {
        console.error('Error fetching card content:', error);
        cardGroup.userData.revealed = false;
        cardGroup.userData.selected = false;
        revealedCardCount--;
    });
}

// Tek bir kart için Are.na içeriği çek
async function fetchSingleCardContent() {
    try {
        // Eğer daha önce içerik çekilmişse, onlardan birini kullan
        if (cards && cards.length > 0) {
            const randomIndex = Math.floor(Math.random() * cards.length);
            return cards[randomIndex];
        }
        
        // İlk kez çekiyorsak, API'ye git
        const randomQuery = getRandomQuery();
        
        const searchResponse = await fetch(`${ARENA_API_BASE}/search?q=${encodeURIComponent(randomQuery)}&per=10`); // Sadece 10 içerik çek
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

        // If no cards found, try another query
        if (cards.length === 0) {
            return fetchSingleCardContent();
        }
        
        const randomIndex = Math.floor(Math.random() * cards.length);
        return cards[randomIndex];
    } catch (error) {
        console.error('Error fetching content:', error);
        throw error;
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
        if (child.isTextLabel || child.isArenaLink) {
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
    
    // Draw the text - Use 'MedievalSharp' instead of 'Cal Sans'
    context.font = 'bold 32px "MedievalSharp", cursive';
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
    
    // Also add an Arena link indicator if we have a URL
    if (cardGroup.userData.arenaUrl) {
        createArenaLinkIndicator(cardGroup);
    }
}

// Create a visual indicator for an Are.na link on the card
function createArenaLinkIndicator(cardGroup) {
    // Create canvas for the Are.na icon
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    
    // Clear the canvas
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw a small Are.na logo/icon (simplified as "A.")
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.beginPath();
    context.arc(canvas.width/2, canvas.height/2, 20, 0, Math.PI * 2);
    context.fill();
    
    context.font = 'bold 26px "MedievalSharp", cursive';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = 'white';
    context.fillText('↓', canvas.width/2, canvas.height/2);
    
    // Create a texture from the canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    
    // Create a material using the texture
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0 // Start invisible for animation
    });
    
    // Create a small plane for the icon
    const geometry = new THREE.PlaneGeometry(0.5, 0.5);
    const iconMesh = new THREE.Mesh(geometry, material);
    iconMesh.isArenaLink = true;
    
    // Store the URL in the mesh userdata
    iconMesh.userData.arenaUrl = cardGroup.userData.arenaUrl;
    
    // Position the icon in the top right corner of the card
    iconMesh.position.x = 0.8;  // Right side
    iconMesh.position.y = 1.5;  // Top
    iconMesh.position.z = 0.03; // Slightly in front of the card
    
    // Add the icon to the card group
    cardGroup.add(iconMesh);
    
    // Animate the icon appearing (with slight delay)
    setTimeout(() => {
        animateLabelAppearance(material);
    }, 500);
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
        
        // Decide whether to show shuffle animation again (20% chance)
        const showShuffleAgain = Math.random() < 0.2;
        
        // Remove current cards with a fly-away animation
        const flyAwayPromises = [];
        
        cardMeshes.forEach((cardGroup, i) => {
            const promise = new Promise((resolve) => {
                // Random target position off-screen
                const targetX = (Math.random() - 0.5) * 30;
                const targetY = -10 - Math.random() * 5;
                const targetZ = (Math.random() - 0.5) * 30;
                
                const startPos = {
                    x: cardGroup.position.x,
                    y: cardGroup.position.y,
                    z: cardGroup.position.z
                };
                
                const flyDuration = 500 + Math.random() * 200;
                const startTime = Date.now();
                
                function flyAway() {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(elapsed / flyDuration, 1);
                    
                    // Easing function
                    const easedProgress = progress;
                    
                    // Update position
                    cardGroup.position.x = startPos.x + (targetX - startPos.x) * easedProgress;
                    cardGroup.position.y = startPos.y + (targetY - startPos.y) * easedProgress;
                    cardGroup.position.z = startPos.z + (targetZ - startPos.z) * easedProgress;
                    
                    // Add some rotation
                    cardGroup.rotation.x += 0.05;
                    cardGroup.rotation.z += 0.03;
                    
                    if (progress < 1) {
                        requestAnimationFrame(flyAway);
                    } else {
                        // Remove the card from the scene
                        scene.remove(cardGroup);
                        resolve();
                    }
                }
                
                // Start with a slight delay based on index
                setTimeout(() => {
                    flyAway();
                }, i * 100);
            });
            
            flyAwayPromises.push(promise);
        });
        
        // When all cards have flown away, fetch new content and create new cards
        Promise.all(flyAwayPromises).then(() => {
            // Clear the card meshes array
            cardMeshes = [];
            
            // Fetch new content from Are.na
            fetchRandomContent().then(() => {
                // Determine whether to show shuffle animation or go directly to cards
                if (showShuffleAgain) {
                    isInitialAnimation = true;
                    createShuffleAnimation();
                } else {
                    isInitialAnimation = false;
                    createCards();
                }
                
                animating = false;
            }).catch(error => {
                console.error('Error fetching new content:', error);
                isInitialAnimation = false;
                createCards();
                animating = false;
            });
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
            // Get the intersected object
            const intersectedObject = intersects[0].object;
            
            // Check if this is an Are.na link indicator
            if (intersectedObject.isArenaLink && intersectedObject.userData.arenaUrl) {
                // Open the Are.na URL in a new tab
                window.open(intersectedObject.userData.arenaUrl, '_blank');
                return;
            }
            
            // Get the parent group of the intersected mesh
            const intersectedGroup = intersectedObject.userData.parentGroup;
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
            // Get the first intersected object
            const intersectedObject = intersects[0].object;
            
            // Check if we're hovering over an Are.na link indicator
            if (intersectedObject.isArenaLink) {
                // If hovering over an Are.na link, use pointer cursor
                containerElement.style.cursor = 'pointer';
                
                // Reset any previously hovered card
                if (hoveredCard) {
                    gsapLikeScale(hoveredCard, 1, 1, 1);
                    hoveredCard = null;
                }
                return;
            }
            
            // Get the parent group of the intersected mesh
            const intersectedGroup = intersectedObject.userData.parentGroup;
            
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