// Global variables
let allPokemon = [];
let currentSort = 'alphabetic';
let currentTypeFilter = 'all';

// DOM elements
const tableBody = document.getElementById('pokemonTableBody');
const sortFilter = document.getElementById('sortFilter');
const typeFilter = document.getElementById('typeFilter');
const loading = document.getElementById('loading');
const loadingProgress = document.getElementById('loadingProgress');
const modal = document.getElementById('pokemonModal');
const modalBody = document.getElementById('modalBody');
const closeBtn = document.querySelector('.close');

// Generate unique color for each ability
function getAbilityColor(ability) {
    // Beautiful base colors (hues)
    const baseHues = [
        0,    // Red
        15,   // Orange-Red
        30,   // Orange
        45,   // Yellow-Orange
        60,   // Yellow
        90,   // Yellow-Green
        120,  // Green
        150,  // Green-Cyan
        180,  // Cyan
        200,  // Light Blue
        220,  // Blue
        240,  // Deep Blue
        260,  // Blue-Purple
        280,  // Purple
        300,  // Magenta
        320,  // Pink
        340   // Hot Pink
    ];
    
    // Hash the ability name
    let hash = 0;
    for (let i = 0; i < ability.length; i++) {
        hash = ability.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Select hue from base colors
    const hue = baseHues[Math.abs(hash) % baseHues.length];
    
    // Vary lightness based on hash to create light to dark variations
    const lightness = 45 + ((Math.abs(hash >> 8) % 30));
    
    return `hsl(${hue}, 70%, ${lightness}%)`;
}

// Fetch Pokemon data from PokeAPI
async function fetchPokemonData() {
    try {
        // First, get the list of all Pokemon
        const response = await fetch('https://pokeapi.co/api/v2/pokemon?limit=1025');
        const data = await response.json();
        
        // Fetch detailed data for each Pokemon
        const pokemonPromises = data.results.map(async (pokemon, index) => {
            try {
                // Update loading progress
                loadingProgress.textContent = `${index + 1}/1025`;
                
                // Fetch Pokemon details
                const pokemonResponse = await fetch(pokemon.url);
                const pokemonData = await pokemonResponse.json();
                
                // Fetch species data for description
                const speciesResponse = await fetch(pokemonData.species.url);
                const speciesData = await speciesResponse.json();
                
                // Get English description
                const description = speciesData.flavor_text_entries
                    .find(entry => entry.language.name === 'en')?.flavor_text
                    .replace(/\f/g, ' ') || 'No description available.';
                
                return {
                    id: pokemonData.id,
                    name: pokemonData.name,
                    image: pokemonData.sprites.other['official-artwork'].front_default || 
                           pokemonData.sprites.front_default,
                    abilities: pokemonData.abilities.map(a => a.ability.name),
                    description: description,
                    types: pokemonData.types.map(t => t.type.name),
                    stats: pokemonData.stats,
                    height: pokemonData.height,
                    weight: pokemonData.weight,
                    fullData: pokemonData
                };
            } catch (error) {
                console.error(`Error fetching ${pokemon.name}:`, error);
                return null;
            }
        });
        
        // Wait for all Pokemon data to be fetched
        allPokemon = (await Promise.all(pokemonPromises)).filter(p => p !== null);
        
        // Hide loading indicator
        loading.classList.add('hidden');
        
        // Display Pokemon
        displayPokemon();
    } catch (error) {
        console.error('Error fetching Pokemon data:', error);
        loading.innerHTML = '<p style="color: red;">Error loading Pokemon data. Please refresh the page.</p>';
    }
}

// Sort Pokemon based on selected filter
function sortPokemon(pokemon) {
    const sorted = [...pokemon];
    
    switch (currentSort) {
        case 'alphabetic':
            sorted.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'alphabetic-reverse':
            sorted.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'abilities':
            sorted.sort((a, b) => b.abilities.length - a.abilities.length);
            break;
        case 'abilities-reverse':
            sorted.sort((a, b) => a.abilities.length - b.abilities.length);
            break;
        case 'oldest':
            sorted.sort((a, b) => a.id - b.id);
            break;
        case 'newest':
            sorted.sort((a, b) => b.id - a.id);
            break;
    }
    
    return sorted;
}

// Get type color
function getTypeColor(type) {
    const typeColors = {
        normal: '#A8A878', fire: '#F08030', water: '#6890F0',
        electric: '#F8D030', grass: '#78C850', ice: '#98D8D8',
        fighting: '#C03028', poison: '#A040A0', ground: '#E0C068',
        flying: '#A890F0', psychic: '#F85888', bug: '#A8B820',
        rock: '#B8A038', ghost: '#705898', dragon: '#7038F8',
        dark: '#705848', steel: '#B8B8D0', fairy: '#EE99AC'
    };
    return typeColors[type] || '#777';
}

// Show Pokemon details in modal
function showPokemonDetails(pokemon) {
    const statsHtml = pokemon.stats.map(stat => `
        <div class="stat-item">
            <div class="stat-label">${stat.stat.name.replace('-', ' ')}</div>
            <div class="stat-value">${stat.base_stat}</div>
        </div>
    `).join('');

    const typesHtml = pokemon.types.map(type => 
        `<span class="type-badge" style="background: ${getTypeColor(type)};">${type}</span>`
    ).join('');

    const abilitiesHtml = pokemon.abilities.map(ability => 
        `<span class="ability-badge" style="background: ${getAbilityColor(ability)};">${ability}</span>`
    ).join(' ');

    modalBody.innerHTML = `
        <div class="modal-header">
            <div class="modal-pokemon-id">#${String(pokemon.id).padStart(3, '0')}</div>
            <h2 class="modal-pokemon-name">${pokemon.name}</h2>
            <img src="${pokemon.image}" alt="${pokemon.name}" class="modal-pokemon-image">
            <div>${typesHtml}</div>
        </div>

        <div class="modal-section">
            <h3>Description</h3>
            <p>${pokemon.description}</p>
        </div>

        <div class="modal-section">
            <h3>Abilities</h3>
            <div class="abilities">${abilitiesHtml}</div>
        </div>

        <div class="modal-section">
            <h3>Physical Attributes</h3>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-label">Height</div>
                    <div class="stat-value">${(pokemon.height / 10).toFixed(1)}m</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Weight</div>
                    <div class="stat-value">${(pokemon.weight / 10).toFixed(1)}kg</div>
                </div>
            </div>
        </div>

        <div class="modal-section">
            <h3>Base Stats</h3>
            <div class="stat-grid">
                ${statsHtml}
            </div>
        </div>
    `;

    modal.style.display = 'block';
}

// Display Pokemon in the table
function displayPokemon() {
    // Clear existing table
    tableBody.innerHTML = '';
    
    // Filter by type
    let filteredPokemon = allPokemon;
    if (currentTypeFilter !== 'all') {
        filteredPokemon = allPokemon.filter(pokemon => 
            pokemon.types.includes(currentTypeFilter)
        );
    }
    
    // Sort Pokemon
    const sortedPokemon = sortPokemon(filteredPokemon);
    
    // Create table rows
    sortedPokemon.forEach(pokemon => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td class="pokemon-id">#${String(pokemon.id).padStart(3, '0')}</td>
            <td><img src="${pokemon.image}" alt="${pokemon.name}" class="pokemon-image"></td>
            <td class="pokemon-name">${pokemon.name}</td>
            <td>
                <div class="abilities">
                    ${pokemon.types.map(type => 
                        `<span class="type-badge" style="background: ${getTypeColor(type)};">${type}</span>`
                    ).join('')}
                </div>
            </td>
            <td>
                <div class="abilities">
                    ${pokemon.abilities.map(ability => 
                        `<span class="ability-badge" style="background: ${getAbilityColor(ability)};">${ability}</span>`
                    ).join('')}
                </div>
            </td>
            <td class="description">${pokemon.description}</td>
        `;
        
        // Add click event to show modal
        row.addEventListener('click', () => showPokemonDetails(pokemon));
        
        tableBody.appendChild(row);
    });
}

// Event listener for sort filter
sortFilter.addEventListener('change', (e) => {
    currentSort = e.target.value;
    displayPokemon();
});

// Event listener for type filter
typeFilter.addEventListener('change', (e) => {
    currentTypeFilter = e.target.value;
    displayPokemon();
});

// Modal event listeners
closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
});

// Initialize the app
fetchPokemonData();
