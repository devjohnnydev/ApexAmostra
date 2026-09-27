const fs = require('fs');
let c = fs.readFileSync('admin_live.js', 'utf8');

const dict = {
    'â†’': '→',
    'ðŸ“ˆ': '📈',
    'ðŸ“‰': '📉',
    'ðŸ’°': '💰',
    'ðŸ¥‡': '🥇',
    'ðŸ¥ˆ': '🥈',
    'ðŸ¥‰': '🥉',
    'âš ï¸\x8F': '⚠️',
    'âš ï¸': '⚠️',
    'âœ✅': '✅',
    'â\x9DŒ': '❌',
    'ðŸ”„': '🔄',
    'ðŸ”´': '🔴',
    'ðŸŸ ': '🟠',
    'ðŸŸ¡': '🟡',
    'ðŸŸ¢': '🟢',
    'ðŸ”\x8D': '🔍',
    'ðŸšš': '🚚',
    'ðŸ“¦': '📦',
    'ðŸŽ¯': '🎯',
    'ðŸ§®': '🧮',
    'ðŸ“…': '📅',
    'ðŸ›’': '🛒',
    'ðŸ’¸': '💸',
    'ðŸ”¥': '🔥',
    'ðŸŒŸ': '🌟',
    'ðŸ”µ': '🔵',
    'ðŸš¨': '🚨',
    'ðŸ”®': '🔮',
    'ðŸ“Š': '📊',
    'ðŸ’µ': '💵',
    'âœŽ': '✏️',
    'âœ•': '✕',
    'â–²': '▲',
    'â–¼': '▼',
    'â¬†': '⬆️',
    'â¬‡': '⬇️',
    'â\x8F³': '⏳',
    'ðŸ›¡ï¸\x8F': '🛡️',
    'ðŸ›¡ï¸': '🛡️',
    'ðŸš€': '🚀',
    'ðŸ“¸': '📸',
    'ðŸ”§': '🔧',
    'âœ”': '✔',
    'â€“': '–',
    'â†“': '↓',
    'â†‘': '↑',
    'ðŸ”’': '🔒',
    'â€¢': '•'
};

for (const [k, v] of Object.entries(dict)) {
    c = c.split(k).join(v);
}

// Special fixes for strings that were broken because of string escaping
c = c.replace(/âmera não disponível/g, 'Câmera não disponível');
c = c.replace(/âmera não ativa/g, 'Câmera não ativa');
c = c.replace(/echa a câmera imediatamente/g, 'Fecha a câmera imediatamente');
c = c.replace(/echa e desliga a câmera/g, 'Fecha e desliga a câmera');

fs.writeFileSync('admin_live.js', c);
console.log('Fixed admin_live.js!');
