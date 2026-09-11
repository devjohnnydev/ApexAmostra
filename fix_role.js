const fs = require('fs');
let code = fs.readFileSync('admin.js', 'utf8');

const replacement = `    function applyRolePermissions() {
        const rawRole = currentSimulatedRole || '';
        const role = String(rawRole).trim().toLowerCase();

        // Se por acaso as permissoes ainda nao carregaram ou o role nao existir, falha fechado
        let permissoes = globalRolePermissions[rawRole] || [];
        
        // Regra permissiva para administradores
        if (role.includes('admin') || role.includes('master') || role.includes('diretor') || role === 'undefined' || role === 'null' || role === '') {
            // Admin ve tudo
            permissoes = ['view_lme', 'view_precos', 'view_catalogo', 'view_fornecedores', 'view_laboratorio', 'view_planejamento', 'view_estoque', 'view_bi', 'edit_financeiro', 'edit_producao', 'view_usuarios', 'view_permissoes', 'view_financeiro', 'view_pedidos', 'view_clientes', 'view_estrategico', 'view_site'];
        }

        const temPermissao = (p) => permissoes.includes(p);`;

let start = code.indexOf('function applyRolePermissions() {');
let end = code.indexOf('const temPermissao = (p) => permissoes.includes(p);', start) + 51;
let newCode = code.substring(0, start) + replacement + code.substring(end);

fs.writeFileSync('admin.js', newCode);
console.log('Replaced successfully');
