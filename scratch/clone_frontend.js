const fs = require('fs');

let c = fs.readFileSync('admin.html', 'utf8');

// 1. Add Navigation Link
const navVenda = `<a href="#" class="nav-item" data-target="pedidos-venda-view"><i class="fa-solid fa-file-invoice-dollar"></i> Pedidos de Venda</a>`;
const navCompra = `<a href="#" class="nav-item" data-target="pedidos-compra-view"><i class="fa-solid fa-file-invoice"></i> Pedidos de Compra</a>`;
c = c.replace(navVenda, navVenda + '\\n            ' + navCompra);

// 2. Clone View Section
const viewStart = `<div id="pedidos-venda-view" class="view-section" style="display:none;">`;
const viewEndStr = `<!-- Fim da seção de pedidos de venda -->`; // Might not exist, let's find the closing div of the section.
// A simpler way: grab the whole section using indexOf
const s1 = c.indexOf(viewStart);
const s2 = c.indexOf(`<div id="planejamento-view"`, s1); // assuming planejamento-view is after it
let sectionVenda = c.substring(s1, s2);
let sectionCompra = sectionVenda
    .replace(/pedidos-venda/g, 'pedidos-compra')
    .replace(/Pedidos de Venda/g, 'Pedidos de Compra')
    .replace(/abrirNovoPedido\(\)/g, 'abrirNovoPedidoCompra()')
    .replace(/carregarPedidos\(\)/g, 'carregarPedidosCompra()')
    .replace(/pedidos-filtro-status/g, 'pedidos-compra-filtro-status')
    .replace(/pedidos-busca/g, 'pedidos-compra-busca')
    .replace(/pedidos-table-body/g, 'pedidos-compra-table-body');

c = c.slice(0, s2) + sectionCompra + c.slice(s2);

// 3. Clone Modal
const modalStart = `<div id="modal-pedido-venda" class="fullscreen-overlay"`;
// find the closing tag for the modal. It ends with </div> just before `<!-- Modal Webcam`
const endModalStr = `<!-- Modal Webcam`;
const m1 = c.indexOf(modalStart);
const m2 = c.indexOf(endModalStr, m1);
let modalVenda = c.substring(m1, m2);
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

c = c.slice(0, m2) + modalCompra + c.slice(m2);

fs.writeFileSync('admin.html', c);
console.log('admin.html cloned successfully!');
