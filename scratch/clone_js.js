const fs = require('fs');

const c = fs.readFileSync('admin_live.js', 'utf8');
const start = c.indexOf('// PEDIDOS DE VENDA');
if (start === -1) {
    console.error('Section // PEDIDOS DE VENDA not found');
    process.exit(1);
}

let chunk = c.substring(start);

// Replace everything related to Venda with Compra
let newChunk = chunk
    .replace(/\/\/ PEDIDOS DE VENDA/g, '// PEDIDOS DE COMPRA')
    .replace(/pedidos-venda/g, 'pedidos-compra')
    .replace(/Pedidos de Venda/g, 'Pedidos de Compra')
    .replace(/pedido_venda/g, 'pedido_compra')
    .replace(/abrirNovoPedido\(/g, 'abrirNovoPedidoCompra(')
    .replace(/fecharModalPedido\(/g, 'fecharModalPedidoCompra(')
    .replace(/buscarClientePedido\(/g, 'buscarFornecedorPedido(')
    .replace(/selecionarClientePedido\(/g, 'selecionarFornecedorPedido(')
    .replace(/limparClientePedido\(/g, 'limparFornecedorPedido(')
    .replace(/redirecionarParaCadastroCliente\(/g, 'redirecionarParaCadastroFornecedor(')
    .replace(/recalcularPedido\(/g, 'recalcularPedidoCompra(')
    .replace(/renderItensPedido\(/g, 'renderItensPedidoCompra(')
    .replace(/adicionarItemPedido\(/g, 'adicionarItemPedidoCompra(')
    .replace(/removerItemPedido\(/g, 'removerItemPedidoCompra(')
    .replace(/salvarPedido\(/g, 'salvarPedidoCompra(')
    .replace(/editarPedido\(/g, 'editarPedidoCompra(')
    .replace(/excluirPedido\(/g, 'excluirPedidoCompra(')
    .replace(/imprimirPedido\(/g, 'imprimirPedidoCompra(')
    .replace(/exportarPedidoPdfDoForm\(/g, 'exportarPedidoPdfDoFormCompra(')
    .replace(/gerarPdfPedidoVenda\(/g, 'gerarPdfPedidoCompra(')
    .replace(/carregarPedidos\(/g, 'carregarPedidosCompra(')
    .replace(/renderPedidos\(/g, 'renderPedidosCompra(')
    .replace(/aprovarPedido\(/g, 'aprovarPedidoCompra(')

    // Selectors and IDs
    .replace(/pedido-numero/g, 'pedidoc-numero')
    .replace(/pedido-vendedor/g, 'pedidoc-vendedor')
    .replace(/pedido-perfil/g, 'pedidoc-perfil')
    .replace(/pedido-data-emissao/g, 'pedidoc-data-emissao')
    .replace(/pedido-data-entrega/g, 'pedidoc-data-entrega')
    .replace(/pedido-status-header/g, 'pedidoc-status-header')
    .replace(/pedido-cliente-busca/g, 'pedidoc-fornecedor-busca')
    .replace(/pedido-cliente-id/g, 'pedidoc-fornecedor-id')
    .replace(/pedido-cliente-dropdown/g, 'pedidoc-fornecedor-dropdown')
    .replace(/pedido-cliente-card/g, 'pedidoc-fornecedor-card')
    .replace(/pedido-endereco-entrega/g, 'pedidoc-endereco-entrega')
    .replace(/pedido-responsavel-recebimento/g, 'pedidoc-responsavel-recebimento')
    .replace(/pedido-tipo-frete/g, 'pedidoc-tipo-frete')
    .replace(/pedido-item-material/g, 'pedidoc-item-material')
    .replace(/pedido-item-id/g, 'pedidoc-item-id')
    .replace(/pedido-item-dropdown/g, 'pedidoc-item-dropdown')
    .replace(/pedido-item-descricao/g, 'pedidoc-item-descricao')
    .replace(/pedido-item-unidade/g, 'pedidoc-item-unidade')
    .replace(/pedido-item-quantidade/g, 'pedidoc-item-quantidade')
    .replace(/pedido-item-preco/g, 'pedidoc-item-preco')
    .replace(/pedido-item-desconto/g, 'pedidoc-item-desconto')
    .replace(/pedido-item-total/g, 'pedidoc-item-total')
    .replace(/pedido-total-itens/g, 'pedidoc-total-itens')
    .replace(/pedido-desconto/g, 'pedidoc-desconto')
    .replace(/pedido-frete/g, 'pedidoc-frete')
    .replace(/pedido-total-geral/g, 'pedidoc-total-geral')
    .replace(/pedido-obs/g, 'pedidoc-obs')
    .replace(/pedido-condicao/g, 'pedidoc-condicao')
    .replace(/pedido-condicao-custom/g, 'pedidoc-condicao-custom')
    .replace(/pedido-rastreamento-box/g, 'pedidoc-rastreamento-box')
    .replace(/pedido-criado-em/g, 'pedidoc-criado-em')
    .replace(/pedido-atualizado-em/g, 'pedidoc-atualizado-em')
    .replace(/pedido-aprovado-por/g, 'pedidoc-aprovado-por')
    .replace(/pedido-data-aprovacao/g, 'pedidoc-data-aprovacao')
    .replace(/pedido-id/g, 'pedidoc-id')
    .replace(/pedido-status/g, 'pedidoc-status')

    // More UI mappings
    .replace(/cc-nome/g, 'fc-nome')
    .replace(/cc-cnpj/g, 'fc-cnpj')
    .replace(/cc-cidade/g, 'fc-cidade')
    .replace(/cc-uf/g, 'fc-uf')
    .replace(/cc-endereco/g, 'fc-endereco')
    .replace(/cc-tel/g, 'fc-tel')
    .replace(/cc-email/g, 'fc-email')
    .replace(/cc-status-badge/g, 'fc-status-badge')
    
    // JS variables
    .replace(/window\.localPedidos/g, 'window.localPedidosCompra')
    .replace(/itensPedido/g, 'itensPedidoCompra')
    .replace(/cliente_id/g, 'fornecedor_id')
    .replace(/cliente_nome/g, 'fornecedor_nome')
    .replace(/cliente_cnpj/g, 'fornecedor_cnpj')
    .replace(/cliente_cidade/g, 'fornecedor_cidade')
    .replace(/cliente_uf/g, 'fornecedor_uf')
    .replace(/cliente_telefone/g, 'fornecedor_telefone')
    .replace(/cliente_email/g, 'fornecedor_email')
    .replace(/cliente_endereco/g, 'fornecedor_endereco')
    .replace(/\/api\/clientes/g, '/api/fornecedores')
    .replace(/window\.localClientes/g, 'window.localFornecedores')
    
    // Modal buttons
    .replace(/btn-aprovar-pedido/g, 'btnc-aprovar-pedido')
    .replace(/btn-salvar-pedido/g, 'btnc-salvar-pedido')
    .replace(/_aprovar_pedido_flag/g, '_aprovar_pedido_compra_flag')
    .replace(/form-pedido-venda/g, 'form-pedido-compra');

// Ensure variable declarations exist in this file context
newChunk = `
let itensPedidoCompra = [];
` + newChunk;

fs.writeFileSync('assets/js/modules/admin_compras.js', newChunk);
console.log('admin_compras.js created successfully!');
