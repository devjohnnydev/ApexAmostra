/**
 * Interceptor Global de Autenticação
 * Este script faz o "Monkey Patch" do window.fetch nativo para injetar o Token JWT.
 */
(function() {
    const originalFetch = window.fetch;
    window.fetch = async function() {
        let [resource, config] = arguments;
        
        // Verifica se é uma requisição para a nossa API (ignora externos ou arquivos estáticos)
        if (typeof resource === 'string' && resource.startsWith('/api/') && resource !== '/api/login') {
            config = config || {};
            config.headers = config.headers || {};
            
            const token = localStorage.getItem('apex_token');
            if (token) {
                config.headers['Authorization'] = 'Bearer ' + token;
            }
            
            arguments[1] = config;
        }
        
        const response = await originalFetch.apply(this, arguments);
        
        // Se a resposta for 401 (Não Autenticado), redireciona/desloga o usuário
        if (response.status === 401) {
            console.error('Sessão expirada ou acesso negado (401).');
            // Força o logout apenas se a requisição não for o próprio login
            if (resource !== '/api/login') {
                localStorage.removeItem('apex_token');
                sessionStorage.removeItem('apex_admin_logged_in');
                window.location.reload();
            }
        }
        
        // Se a resposta for 403 (Forbidden), exibe um log ou erro
        if (response.status === 403) {
            console.warn('Acesso Negado (403): O seu perfil não tem permissão para acessar este recurso.');
            if (window._apexNotify) {
                window._apexNotify('Acesso Negado', 'Seu perfil não possui permissão para acessar estes dados.', 'error');
            }
        }
        
        return response;
    };
})();
