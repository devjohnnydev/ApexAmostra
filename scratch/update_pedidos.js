const fs = require('fs');
let c = fs.readFileSync('admin_live.js', 'utf8');

const regexNovo = /document\.getElementById\('pedido-numero'\)\.value = 'PV-' \+ String\(Math\.floor\(Date\.now\(\)\/1000\)%10000\)\.padStart\(4,'0'\);/;
c = c.replace(regexNovo, `document.getElementById('pedido-numero').value = 'PV-' + String(Math.floor(Date.now()/1000)%10000).padStart(4,'0');
        if(document.getElementById('pedido-rastreamento-box')) document.getElementById('pedido-rastreamento-box').style.display = 'none';
        if(document.getElementById('btn-aprovar-pedido')) document.getElementById('btn-aprovar-pedido').style.display = 'none';
        if(document.getElementById('pedido-status-header')) document.getElementById('pedido-status-header').value = 'Rascunho';
        if(document.getElementById('pedido-data-entrega')) document.getElementById('pedido-data-entrega').value = '';`);

const regexEditar = /document\.getElementById\('pedido-data-entrega'\)\.value\s*=\s*\(data\.data_entrega\|\|''\)\.slice\(0,10\);/;
c = c.replace(regexEditar, `document.getElementById('pedido-data-entrega').value    = (data.data_entrega||'').slice(0,10);
            if(document.getElementById('pedido-status-header')) document.getElementById('pedido-status-header').value = data.status || 'Rascunho';
            
            if(document.getElementById('pedido-rastreamento-box')) {
                document.getElementById('pedido-rastreamento-box').style.display = 'flex';
                document.getElementById('pedido-criado-em').textContent = data.criado_em ? new Date(data.criado_em).toLocaleString('pt-BR') : '-';
                document.getElementById('pedido-atualizado-em').textContent = data.atualizado_em ? new Date(data.atualizado_em).toLocaleString('pt-BR') : '-';
                document.getElementById('pedido-aprovado-por').textContent = data.aprovado_por || 'Pendente';
                document.getElementById('pedido-data-aprovacao').textContent = data.data_aprovacao ? '(' + new Date(data.data_aprovacao).toLocaleString('pt-BR') + ')' : '';
            }
            if(document.getElementById('btn-aprovar-pedido')) {
                const isDiretoria = globalRolePermissions && globalRolePermissions['Pedidos de Venda'] === 'Escrita';
                if (data.status !== 'Aprovado' && isDiretoria) {
                    document.getElementById('btn-aprovar-pedido').style.display = 'inline-block';
                } else {
                    document.getElementById('btn-aprovar-pedido').style.display = 'none';
                }
            }`);

const regexSalvar = /const body = \{[\s\S]*?itens: itensPedido\n\s*\};/;
c = c.replace(regexSalvar, `const body = {
            numero: document.getElementById('pedido-numero').value,
            cliente_id: parseInt(document.getElementById('pedido-cliente-id').value) || null,
            cliente_nome: document.getElementById('cc-nome').textContent || '',
            data_emissao: document.getElementById('pedido-data-emissao').value,
            data_entrega: document.getElementById('pedido-data-entrega') ? document.getElementById('pedido-data-entrega').value : null,
            status: document.getElementById('pedido-status').value,
            condicao_pagamento: document.getElementById('pedido-condicao').value === 'OUTRA' ? document.getElementById('pedido-condicao-custom').value : document.getElementById('pedido-condicao').value,
            observacoes: document.getElementById('pedido-obs').value,
            desconto_pct: parseFloat(document.getElementById('pedido-desconto').value) || 0,
            frete: parseFloat(document.getElementById('pedido-frete').value) || 0,
            endereco_entrega: document.getElementById('pedido-endereco-entrega') ? document.getElementById('pedido-endereco-entrega').value : '',
            responsavel_recebimento: document.getElementById('pedido-responsavel-recebimento') ? document.getElementById('pedido-responsavel-recebimento').value : '',
            tipo_frete: document.getElementById('pedido-tipo-frete') ? document.getElementById('pedido-tipo-frete').value : '',
            criado_por: sessionStorage.getItem('apex_logged_user_name') || 'Admin',
            criado_por_perfil: sessionStorage.getItem('apex_logged_user_role') || 'Administrador',
            aprovado_por: window._aprovar_pedido_flag ? (sessionStorage.getItem('apex_logged_user_name') || 'Admin') : null,
            itens: itensPedido
        };
        if (window._aprovar_pedido_flag) body.status = 'Aprovado';`);

const funcAprovar = `
    window.aprovarPedido = function() {
        if (!confirm('Deseja realmente aprovar este pedido? O status mudará para Aprovado e você será registrado como o aprovador.')) return;
        window._aprovar_pedido_flag = true;
        document.getElementById('form-pedido-venda').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    };
`;

if (!c.includes('window.aprovarPedido')) {
    c += funcAprovar;
}

fs.writeFileSync('admin_live.js', c);
console.log('admin_live.js updated!');
