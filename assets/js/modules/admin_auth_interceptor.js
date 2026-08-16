/**
 * Interceptor Global de Autenticação e Caching (State Management)
 * Faz o "Monkey Patch" do window.fetch nativo para injetar JWT e criar cache em memória.
 */
(function() {
    const originalFetch = window.fetch;

    // Cache Global State Manager
    window.ApexCache = {
        ttl: 60000, // 60 segundos padrão
        data: new Map(), // { [url]: { time: Date.now(), body: string, contentType: string } }
        promises: new Map(), // Para desduplicação de chamadas simultâneas
        
        clear: function(prefix = null) {
            if (!prefix) {
                this.data.clear();
                this.promises.clear();
                console.log('[ApexCache] Cache global limpo.');
            } else {
                for (let key of this.data.keys()) {
                    if (key.startsWith(prefix)) this.data.delete(key);
                }
                for (let key of this.promises.keys()) {
                    if (key.startsWith(prefix)) this.promises.delete(key);
                }
                console.log(`[ApexCache] Cache limpo para o prefixo: ${prefix}`);
            }
        }
    };

    window.fetch = async function() {
        let [resource, config] = arguments;
        
        // Só interceptamos se for string e começar com /api/
        if (typeof resource === 'string' && resource.startsWith('/api/') && resource !== '/api/login') {
            config = config || {};
            const method = (config.method || 'GET').toUpperCase();
            
            // 1. Injeção de JWT
            config.headers = config.headers || {};
            const token = localStorage.getItem('apex_token');
            if (token) {
                config.headers['Authorization'] = 'Bearer ' + token;
            }
            arguments[1] = config;

            // 2. Lógica de Invalidação de Cache (POST, PUT, DELETE, PATCH)
            if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
                // Invalida o prefixo da rota para garantir que o próximo GET traga dados atualizados
                // Ex: /api/amostras/1 -> invalida /api/amostras
                const segments = resource.split('/');
                const prefix = segments.slice(0, 3).join('/'); // /api/amostras
                window.ApexCache.clear(prefix);
            }

            // 3. Lógica de Leitura do Cache (Apenas GET sem no-store explícito)
            if (method === 'GET' && (!config.cache || config.cache !== 'no-store')) {
                const cacheKey = resource;
                
                // Retorna resposta do cache se válida
                if (window.ApexCache.data.has(cacheKey)) {
                    const cached = window.ApexCache.data.get(cacheKey);
                    if (Date.now() - cached.time < window.ApexCache.ttl) {
                        console.log(`[ApexCache] HIT: ${cacheKey}`);
                        return new Response(cached.body, { 
                            status: 200, 
                            headers: { 'Content-Type': cached.contentType }
                        });
                    } else {
                        window.ApexCache.data.delete(cacheKey); // Expirou
                    }
                }

                // Desduplicação de chamadas simultâneas (Previne múltiplos requests idênticos)
                if (window.ApexCache.promises.has(cacheKey)) {
                    console.log(`[ApexCache] DEDUP: ${cacheKey}`);
                    try {
                        const cachedBody = await window.ApexCache.promises.get(cacheKey);
                        return new Response(cachedBody.body, { 
                            status: 200, 
                            headers: { 'Content-Type': cachedBody.contentType }
                        });
                    } catch(e) {
                        // Se a promise original falhar, segue o jogo
                    }
                }

                // Faz o fetch real e guarda a Promise
                const fetchPromise = originalFetch.apply(this, arguments).then(async response => {
                    if (response.ok) {
                        const clone = response.clone();
                        const body = await clone.text();
                        const contentType = response.headers.get('Content-Type') || 'application/json';
                        
                        const cacheObj = { time: Date.now(), body, contentType };
                        window.ApexCache.data.set(cacheKey, cacheObj);
                        window.ApexCache.promises.delete(cacheKey);
                        return cacheObj;
                    }
                    window.ApexCache.promises.delete(cacheKey);
                    throw response;
                }).catch(err => {
                    window.ApexCache.promises.delete(cacheKey);
                    throw err;
                });

                window.ApexCache.promises.set(cacheKey, fetchPromise);
                
                try {
                    const cacheObj = await fetchPromise;
                    return new Response(cacheObj.body, { 
                        status: 200, 
                        headers: { 'Content-Type': cacheObj.contentType }
                    });
                } catch (responseOrError) {
                    if (responseOrError && responseOrError.status) {
                        return handleAuthErrors(responseOrError, resource);
                    }
                    throw responseOrError;
                }
            }
        }
        
        // Comportamento normal para não-cacheados ou origens externas
        const response = await originalFetch.apply(this, arguments);
        return handleAuthErrors(response, resource);
    };

    function handleAuthErrors(response, resource) {
        if (response.status === 401) {
            console.error('Sessão expirada ou acesso negado (401).');
            if (resource !== '/api/login') {
                localStorage.removeItem('apex_token');
                sessionStorage.removeItem('apex_admin_logged_in');
                window.location.reload();
            }
        }
        if (response.status === 403) {
            console.warn('Acesso Negado (403): O seu perfil não tem permissão para acessar este recurso.');
            if (window._apexNotify) {
                window._apexNotify('Acesso Negado', 'Seu perfil não possui permissão para acessar estes dados.', 'error');
            }
        }
        return response;
    }
})();
