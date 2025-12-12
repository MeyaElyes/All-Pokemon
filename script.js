// Global variables
let allPokemon = [];
let currentSort = 'alphabetic';
let currentTypeFilter = 'all';
let currentSearch = '';

// DOM elements
const tableBody = document.getElementById('pokemonTableBody');
const sortFilter = document.getElementById('sortFilter');
const typeFilter = document.getElementById('typeFilter');
const loading = document.getElementById('loading');
const loadingProgress = document.getElementById('loadingProgress');
const modal = document.getElementById('pokemonModal');
const modalBody = document.getElementById('modalBody');
const closeBtn = document.querySelector('.close');
const searchInput = document.getElementById('searchInput');
const abilityModal = document.getElementById('abilityModal');
const abilityModalBody = document.getElementById('abilityModalBody');
const abilityCloseBtn = document.querySelector('.ability-close');

// Cache for ability details to avoid refetching
const abilityCache = new Map();

// Simple debounce to keep typing smooth
function debounce(fn, delay = 250) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(null, args), delay);
    };
}

// Normalize a string for matching (lowercase, alphanumerics only)
function normalize(str) {
    return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Check if `needle` is a subsequence of `hay` (characters in order, not necessarily contiguous)
function isSubsequence(needle, hay) {
    let i = 0, j = 0;
    while (i < needle.length && j < hay.length) {
        if (needle[i] === hay[j]) i++;
        j++;
    }
    return i === needle.length;
}

// Fuzzy match helper across multiple fields
function fuzzyMatch(term, fields) {
    const n = normalize(term);
    if (!n) return true;
    return fields.some(f => isSubsequence(n, normalize(f)));
}

// Score a single field for relevance: lower is better
function fuzzyScore(term, text) {
    const t = normalize(term);
    const x = normalize(text);
    if (!t) return Number.POSITIVE_INFINITY;
    if (!x) return Number.POSITIVE_INFINITY;
    if (x === t) return 0; // exact
    if (x.startsWith(t)) return 2; // starts-with
    const idx = x.indexOf(t);
    if (idx !== -1) return 10 + idx; // substring (earlier is better)
    if (isSubsequence(t, x)) {
        // Penalize gaps between matched chars
        let i = 0, j = 0, last = -1, gaps = 0;
        while (i < t.length && j < x.length) {
            if (t[i] === x[j]) {
                if (last >= 0) gaps += (j - last - 1);
                last = j;
                i++;
            }
            j++;
        }
        return 100 + gaps;
    }
    return Number.POSITIVE_INFINITY;
}

function getPokemonSearchScore(term, p) {
    const idStr = String(p.id).padStart(3, '0');
    const name = p.name;
    const types = p.types.join(' ');
    const abilities = p.abilities.join(' ');
    return Math.min(
        fuzzyScore(term, name),
        fuzzyScore(term, idStr),
        fuzzyScore(term, types),
        fuzzyScore(term, abilities)
    );
}

// Fetch ability details (cached)
async function fetchAbilityDetails(abilityName) {
    const key = abilityName.toLowerCase();
    if (abilityCache.has(key)) return abilityCache.get(key);
    try {
        const res = await fetch(`https://pokeapi.co/api/v2/ability/${encodeURIComponent(key)}`);
        if (!res.ok) throw new Error('Failed to fetch ability');
        const data = await res.json();
        const effectEntry = (data.effect_entries || []).find(e => e.language?.name === 'en');
        const flavorEntry = (data.flavor_text_entries || []).find(e => e.language?.name === 'en');
        const details = {
            name: data.name,
            shortEffect: effectEntry?.short_effect || 'No short effect available.',
            effect: effectEntry?.effect || 'No detailed effect available.',
            flavor: flavorEntry?.flavor_text?.replace(/\f/g, ' ') || '',
            generation: data.generation?.name?.replace('-', ' ') || ''
        };
        abilityCache.set(key, details);
        return details;
    } catch (err) {
        console.error('Ability fetch error:', err);
        return { name: abilityName, shortEffect: 'Unable to load details right now.', effect: '', flavor: '', generation: '' };
    }
}

function toTitle(s) {
    return (s || '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Format generation like "generation-iii" -> "Generation III"
function formatGeneration(genName) {
    if (!genName) return '';
    const norm = String(genName).toLowerCase().replace(/_/g, '-').replace(/\s+/g, ' ');
    const m = norm.match(/generation[-\s]?([ivx]+)/);
    if (m) return `Generation ${m[1].toUpperCase()}`;
    // Fallback: title case but keep roman numerals uppercase
    return toTitle(genName).replace(/\b(i|ii|iii|iv|v|vi|vii|viii|ix|x)\b/gi, s => s.toUpperCase());
}

async function showAbilityDetails(abilityName) {
    const info = await fetchAbilityDetails(abilityName);
    abilityModalBody.innerHTML = `
        <div class="modal-header">
            <h2 class="modal-pokemon-name">${toTitle(info.name)}</h2>
            ${info.generation ? `<div class=\"modal-pokemon-id\">${formatGeneration(info.generation)}</div>` : ''}
        </div>

        <div class="modal-section">
            <h3>Effect</h3>
            <p>${info.effect || info.shortEffect}</p>
        </div>
    `;
    abilityModal.style.display = 'block';
}

// Update ability badge hover tooltip with short effect (async)
async function updateAbilityBadgeTooltip(badge, abilityName) {
    if (badge.dataset.tooltipLoaded) return;
    const info = await fetchAbilityDetails(abilityName);
    badge.dataset.shortEffect = info.shortEffect;
    badge.dataset.tooltipLoaded = 'true';
}

// Show custom tooltip on badge hover
function showAbilityTooltip(badge, event) {
    const shortEffect = badge.dataset.shortEffect;
    if (!shortEffect) return;
    
    // Remove existing tooltip
    const existing = document.querySelector('.ability-tooltip');
    if (existing) existing.remove();
    
    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'ability-tooltip';
    tooltip.textContent = shortEffect;
    document.body.appendChild(tooltip);
    
    // Position tooltip above badge
    const rect = badge.getBoundingClientRect();
    tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
    tooltip.style.top = (rect.top - tooltip.offsetHeight - 12) + 'px';
    
    badge.dataset.tooltipShown = 'true';
}

// Hide custom tooltip
function hideAbilityTooltip() {
    const tooltip = document.querySelector('.ability-tooltip');
    if (tooltip) tooltip.remove();
}

// Parse advanced query syntax with sticky fields
// Tokens separated by spaces. Field prefixes:
//   no prefix -> name/id
//   :term     -> type term
//   ::term    -> ability term
// Unprefixed tokens inherit the last specified field (sticky),
// starting with 'name' as default.
function parseSearchQuery(q) {
    const tokens = q.trim().split(/\s+/).filter(Boolean);
    const nameTerms = [];
    const typeTerms = [];
    const abilityTerms = [];
    let mode = 'name';
    for (const raw of tokens) {
        if (raw.startsWith('::')) {
            const t = raw.slice(2);
            if (t) abilityTerms.push(t);
            mode = 'ability';
        } else if (raw.startsWith(':')) {
            const t = raw.slice(1);
            if (t) typeTerms.push(t);
            mode = 'type';
        } else {
            if (mode === 'ability') abilityTerms.push(raw);
            else if (mode === 'type') typeTerms.push(raw);
            else nameTerms.push(raw);
        }
    }
    return { nameTerms, typeTerms, abilityTerms };
}

// Ensure a Pokemon matches all terms (AND semantics by field)
function matchesTerms(p, terms) {
    const idStr = String(p.id).padStart(3, '0');
    // name/id terms
    const okName = terms.nameTerms.every(t => {
        const sn = fuzzyScore(t, p.name);
        const si = fuzzyScore(t, idStr);
        return Math.min(sn, si) !== Number.POSITIVE_INFINITY;
    });
    if (!okName) return false;
    // type terms
    const okType = terms.typeTerms.every(t => p.types.some(tp => fuzzyScore(t, tp) !== Number.POSITIVE_INFINITY));
    if (!okType) return false;
    // ability terms
    const okAbility = terms.abilityTerms.every(t => p.abilities.some(ab => fuzzyScore(t, ab) !== Number.POSITIVE_INFINITY));
    if (!okAbility) return false;
    return true;
}

// Compute relevance scores to sort matches (favor name matches)
function computeMatchScores(p, terms) {
    const idStr = String(p.id).padStart(3, '0');
    const sumMin = (list, candidates) => list.reduce((acc, t) => {
        let best = Number.POSITIVE_INFINITY;
        for (const c of candidates) best = Math.min(best, fuzzyScore(t, c));
        return acc + best;
    }, 0);
    const nameScore = sumMin(terms.nameTerms, [p.name, idStr]);
    const typeScore = sumMin(terms.typeTerms, p.types);
    const abilityScore = sumMin(terms.abilityTerms, p.abilities);
    return { nameScore, typeScore, abilityScore };
}

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
        `<span class="ability-badge" data-ability="${ability}" style="background: ${getAbilityColor(ability)};">${ability}</span>`
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
    
    // Filter by single fuzzy search term across name, id, types, abilities
    const term = currentSearch.trim();
    let sortedPokemon;
    if (term) {
        const list = filteredPokemon.filter(p =>
            fuzzyMatch(term, [
                p.name,
                String(p.id).padStart(3, '0'),
                p.types.join(' '),
                p.abilities.join(' ')
            ])
        );
        sortedPokemon = list.sort((a, b) => {
            const sa = getPokemonSearchScore(term, a);
            const sb = getPokemonSearchScore(term, b);
            if (sa !== sb) return sa - sb;
            // tie-break by selected sort, then name
            const [a1, b1] = sortPokemon([a, b]);
            if (a1 !== b1) return a1 === a ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    } else {
        sortedPokemon = sortPokemon(filteredPokemon);
    }
    
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
                        `<span class="ability-badge" data-ability="${ability}" style="background: ${getAbilityColor(ability)};">${ability}</span>`
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

// Event listener for search input
if (searchInput) {
    const onSearch = debounce((e) => {
        currentSearch = e.target.value;
        displayPokemon();
    }, 200);
    searchInput.addEventListener('input', onSearch);
}

// Modal event listeners
closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
});

abilityCloseBtn.addEventListener('click', () => {
    abilityModal.style.display = 'none';
});

window.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.style.display = 'none';
    }
    if (e.target === abilityModal) {
        abilityModal.style.display = 'none';
    }
});

// Ability badge click handling (table)
tableBody.addEventListener('click', (e) => {
    const badge = e.target.closest('.ability-badge');
    if (badge) {
        e.stopPropagation();
        const ability = badge.dataset.ability;
        if (ability) showAbilityDetails(ability);
    }
});

// Ability badge hover to show short effect (table)
tableBody.addEventListener('mouseenter', async (e) => {
    const badge = e.target.closest('.ability-badge');
    if (badge) {
        const ability = badge.dataset.ability;
        if (ability) {
            await updateAbilityBadgeTooltip(badge, ability);
            showAbilityTooltip(badge, e);
        }
    }
}, true);

// Hide tooltip on mouse leave
tableBody.addEventListener('mouseleave', (e) => {
    const badge = e.target.closest('.ability-badge');
    if (badge) hideAbilityTooltip();
}, true);

// Ability badge click handling (inside Pokemon modal)
modalBody.addEventListener('click', async (e) => {
    const badge = e.target.closest('.ability-badge');
    if (badge) {
        e.stopPropagation();
        const ability = badge.dataset.ability;
        if (ability) {
            // First, load tooltip if not already loaded
            if (!badge.dataset.tooltipLoaded) {
                await updateAbilityBadgeTooltip(badge, ability);
            }
            // Show tooltip on click
            showAbilityTooltip(badge, e);
        }
    }
});

// Ability badge hover to show short effect (modal)
modalBody.addEventListener('mouseenter', async (e) => {
    const badge = e.target.closest('.ability-badge');
    if (badge) {
        const ability = badge.dataset.ability;
        if (ability) {
            await updateAbilityBadgeTooltip(badge, ability);
            showAbilityTooltip(badge, e);
        }
    }
}, true);

// Hide tooltip on mouse leave (modal)
modalBody.addEventListener('mouseleave', (e) => {
    const badge = e.target.closest('.ability-badge');
    if (badge) hideAbilityTooltip();
}, true);

// Initialize the app
fetchPokemonData();
