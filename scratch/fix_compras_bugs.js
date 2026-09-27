const fs = require('fs');

// ─── Fix 1: admin_compras.js ─────────────────────────────────────────────────
let compras = fs.readFileSync('assets/js/modules/admin_compras.js', 'utf8');

// Bug 1: função se chama window.abrirNovoPedido ao invés de window.abrirNovoPedidoCompra
compras = compras.replace(
    'window.abrirNovoPedido = async function() { window._aprovar_pedido_compra_flag = false;',
    'window.abrirNovoPedidoCompra = async function() { window._aprovar_pedido_compra_flag = false;'
);

// Bug 2: abre o modal errado (modal-pedido-venda ao invés de modal-pedido-compra)
compras = compras.replace(
    "const modal = document.getElementById('modal-pedido-venda');\n        if (modal) modal.style.display = 'flex';",
    "const modal = document.getElementById('modal-pedido-compra');\n        if (modal) modal.style.display = 'flex';"
);

// Bug 3: título errado no modal de compra
compras = compras.replace(
    "document.getElementById('modal-pedido-titulo').textContent = 'Novo Pedido de Venda';",
    "document.getElementById('modal-pedido-titulo-compra').textContent = 'Novo Pedido de Compra';"
);

// Bug 4: fecharModalPedido aponta para modal errado
compras = compras.replace(
    "window.fecharModalPedido = function() {\n        document.getElementById('modal-pedido-venda').style.display = 'none';",
    "window.fecharModalPedidoCompra = function() {\n        document.getElementById('modal-pedido-compra').style.display = 'none';"
);

// Bug 5: Prefixo PV- errado para pedido de compra (deve ser PC-)
compras = compras.replace(
    "'PV-' + String(Math.floor(Date.now()/1000)%10000).padStart(4,'0')",
    "'PC-' + String(Math.floor(Date.now()/1000)%10000).padStart(4,'0')"
);

// Bug 6: buscarClientePedido usa o nome errado (é buscarFornecedorPedido no compras)
// Fix no salvar: garante que o loggedUser e loggedRole são usados corretamente
// (já estão corretos)

fs.writeFileSync('assets/js/modules/admin_compras.js', compras);
console.log('admin_compras.js fixed!');

// ─── Fix 2: server.js proximo-numero para PC- ─────────────────────────────────
let server = fs.readFileSync('server.js', 'utf8');

// Corrige prefixo PV- para PC- no endpoint de compras
server = server.replace(
    `app.get('/api/pedidos-compra/proximo-numero', async (req, res) => {
    try {
        if (!dbAvailable) {
            const count = (memStore.pedidos_compra || []).length;
            return res.json({ numero: 'PV-' + String(count + 1).padStart(4, '0') });
        }
        const r = await pool.query("SELECT numero FROM pedidos_compra ORDER BY id DESC LIMIT 1");
        if (r[0].length === 0) return res.json({ numero: 'PV-0001' });
        const last = parseInt(r[0][0].numero.replace('PV-', '')) || 0;
        const next = 'PV-' + String(last + 1).padStart(4, '0');
        return res.json({ numero: next });`,
    `app.get('/api/pedidos-compra/proximo-numero', async (req, res) => {
    try {
        if (!dbAvailable) {
            const count = (memStore.pedidos_compra || []).length;
            return res.json({ numero: 'PC-' + String(count + 1).padStart(4, '0') });
        }
        const r = await pool.query("SELECT numero FROM pedidos_compra ORDER BY id DESC LIMIT 1");
        if (r[0].length === 0) return res.json({ numero: 'PC-0001' });
        const last = parseInt((r[0][0].numero || '').replace(/PC-|PV-/g, '')) || 0;
        const next = 'PC-' + String(last + 1).padStart(4, '0');
        return res.json({ numero: next });`
);

fs.writeFileSync('server.js', server);
console.log('server.js fixed!');
