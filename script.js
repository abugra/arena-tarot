// Are.na API configuration
const ARENA_API_BASE = 'https://api.are.na/v2';

// State management
let cards = [];
let drawnCards = [];

// DOM Elements
const cardElements = document.querySelectorAll('.card');
const readingContents = document.querySelectorAll('.reading-content');

// Initialize the application
async function init() {
    try {
        await fetchRandomContent();
        setupEventListeners();
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

// Setup event listeners
function setupEventListeners() {
    cardElements.forEach(card => {
        card.addEventListener('click', async () => {
            // Flip the card
            card.classList.toggle('flipped');
            
            // If card is flipped, fetch new content
            if (card.classList.contains('flipped')) {
                const cardIndex = Array.from(cardElements).indexOf(card);
                const content = readingContents[cardIndex];
                
                // Get a random image from the deck
                if (cards.length > 0) {
                    const randomIndex = Math.floor(Math.random() * cards.length);
                    const randomCard = cards[randomIndex];
                    
                    if (randomCard.image && randomCard.image.display && randomCard.image.display.url) {
                        content.innerHTML = `<img src="${randomCard.image.display.url}" alt="Tarot card">`;
                    } else {
                        // If the selected card has no valid image, try to fetch new content
                        await fetchRandomContent();
                        if (cards.length > 0) {
                            const newRandomIndex = Math.floor(Math.random() * cards.length);
                            const newRandomCard = cards[newRandomIndex];
                            if (newRandomCard.image && newRandomCard.image.display && newRandomCard.image.display.url) {
                                content.innerHTML = `<img src="${newRandomCard.image.display.url}" alt="Tarot card">`;
                            }
                        }
                    }
                }
            }
        });
    });
}

// Initialize the application when the page loads
document.addEventListener('DOMContentLoaded', init); 