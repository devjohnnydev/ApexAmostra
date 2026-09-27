const fs = require('fs');

let c = fs.readFileSync('server.js', 'utf8');

// Find where to insert
const insertRegex = /\/\/ INJEÇÃO DAS ROTAS DO MÓDULO PCP/;
const match = insertRegex.exec(c);

if (match) {
    // Read the file and find the routes for pedidos-venda
    // It's huge, so let's use a regex that matches from app.get('/api/pedidos-venda/proximo-numero' up to the end of app.delete('/api/pedidos-venda/:id'
    
    // Actually, writing a precise regex for arbitrary JS is hard, let's just duplicate the endpoints manually using string replacement of the entire chunk.
    const startIdx = c.indexOf(`app.get('/api/pedidos-venda/proximo-numero'`);
    const endStr = `// INJEÇÃO DAS ROTAS DO MÓDULO PCP`;
    const endIdx = c.indexOf(endStr);
    
    let chunk = c.substring(startIdx, endIdx);
    
    // Replace names
    chunk = chunk.replace(/\/api\/pedidos-venda/g, '/api/pedidos-compra')
                 .replace(/pedidos_venda/g, 'pedidos_compra')
                 .replace(/pedido_venda/g, 'pedido_compra')
                 .replace(/cliente_id/g, 'fornecedor_id')
                 .replace(/cliente_nome/g, 'fornecedor_nome');
                 
    c = c.substring(0, endIdx) + "\n// ROTAS PEDIDOS COMPRA\n" + chunk + "\n" + c.substring(endIdx);
    
    // Also add auth middleware
    const authLine = "app.use('/api/pedidos-venda', requireRole(['Diretoria', 'Comercial', 'Financeiro']));";
    const authInsert = "\napp.use('/api/pedidos-compra', requireRole(['Diretoria', 'Financeiro', 'Compras']));";
    c = c.replace(authLine, authLine + authInsert);
    
    fs.writeFileSync('server.js', c);
    console.log('Rotas backend criadas com sucesso!');
} else {
    console.log('Ponto de inserção não encontrado');
}
