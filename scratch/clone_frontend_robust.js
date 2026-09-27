const fs = require('fs');

let c = fs.readFileSync('admin.html', 'utf8');

// 1. Add Navigation Link
const navVendaStr = '<a href="#" class="nav-item" data-target="pedidos-venda-view"';
const n1 = c.indexOf(navVendaStr);
if (n1 !== -1) {
    const n2 = c.indexOf('</a>', n1) + 4;
    const navVenda = c.substring(n1, n2);
    if (!c.includes('data-target="pedidos-compra-view"')) {
        const navCompra = navVenda
            .replace(/pedidos-venda/g, 'pedidos-compra')
            .replace(/Pedidos de Venda/g, 'Pedidos de Compra')
            .replace('fa-file-invoice-dollar', 'fa-file-invoice');
        c = c.slice(0, n2) + '\n                ' + navCompra + c.slice(n2);
    }
} else {
    console.log("Nav link not found!");
}

// 2. Clone View Section
const viewStartStr = '<section id="pedidos-venda-view"';
const s1 = c.indexOf(viewStartStr);
if (s1 !== -1) {
    const s2 = c.indexOf('</section>', s1) + 10;
    const sectionVenda = c.substring(s1, s2);
    if (!c.includes('id="pedidos-compra-view"')) {
        const sectionCompra = sectionVenda
            .replace(/pedidos-venda/g, 'pedidos-compra')
            .replace(/Pedidos de Venda/g, 'Pedidos de Compra')
            .replace(/abrirNovoPedido\(\)/g, 'abrirNovoPedidoCompra()')
            .replace(/carregarPedidos\(\)/g, 'carregarPedidosCompra()')
            .replace(/pedidos-filtro-status/g, 'pedidos-compra-filtro-status')
            .replace(/pedidos-busca/g, 'pedidos-compra-busca')
            .replace(/pedidos-table-body/g, 'pedidos-compra-table-body');
        
        c = c.slice(0, s2) + '\n\n' + sectionCompra + c.slice(s2);
    }
} else {
    console.log("View section not found!");
}

// 3. Clone Modal
const modalStartStr = '<div id="modal-pedido-venda" class="fullscreen-overlay"';
const m1 = c.indexOf(modalStartStr);
if (m1 !== -1) {
    // Find the end of the modal by looking for <!-- Modal Webcam ou the next top-level thing
    const m2Str = '<!-- Modal Webcam criado dinamicamente pelo admin.js -->';
    let m2 = c.indexOf(m2Str, m1);
    if (m2 === -1) m2 = c.indexOf('<script', m1); // Fallback
    
    const modalVenda = c.substring(m1, m2);
    if (!c.includes('id="modal-pedido-compra"')) {
        let modalCompra = modalVenda
            .replace(/modal-pedido-venda/g, 'modal-pedido-compra')
            .replace(/pedido-venda/g, 'pedido-compra')
            .replace(/Pedido de Venda/g, 'Pedido de Compra')
            .replace(/fecharModalPedido/g, 'fecharModalPedidoCompra')
            .replace(/salvarPedido/g, 'salvarPedidoCompra')
            .replace(/aprovarPedido/g, 'aprovarPedidoCompra')
            .replace(/imprimirPedido/g, 'imprimirPedidoCompra')
            .replace(/buscarClientePedido/g, 'buscarFornecedorPedido')
            .replace(/limparClientePedido/g, 'limparFornecedorPedido')
            .replace(/redirecionarParaCadastroCliente/g, 'redirecionarParaCadastroFornecedor')
            .replace(/pedido-cliente/g, 'pedido-fornecedor')
            .replace(/Cliente \(Destinatário\)/g, 'Fornecedor (Origem)')
            .replace(/CLIENTE CADASTRADO NO SISTEMA/g, 'FORNECEDOR CADASTRADO NO SISTEMA')
            .replace(/cc-nome/g, 'fc-nome')
            .replace(/cc-cnpj/g, 'fc-cnpj')
            .replace(/cc-cidade/g, 'fc-cidade')
            .replace(/cc-uf/g, 'fc-uf')
            .replace(/cc-endereco/g, 'fc-endereco')
            .replace(/cc-tel/g, 'fc-tel')
            .replace(/cc-email/g, 'fc-email')
            .replace(/cc-status-badge/g, 'fc-status-badge')
            // and change IDs of all fields to avoid conflict
            .replace(/id="pedido-/g, 'id="pedidoc-')
            .replace(/id="btn-/g, 'id="btnc-');
            
        c = c.slice(0, m2) + '\n' + modalCompra + '\n' + c.slice(m2);
    }
} else {
    console.log("Modal not found!");
}

fs.writeFileSync('admin.html', c);
console.log('admin.html robustly cloned successfully!');
