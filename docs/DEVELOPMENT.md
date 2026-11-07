# LinkVault — Guia de Desenvolvimento e Roadmap

Para consultar a especificação técnica e de produto completa da aplicação, veja [SPEC.md](./SPEC.md).

## 1. Roadmap de desenvolvimento

### 1.1. Fase 1 — Fundação e deploy inicial

- [x] Criar a estrutura do repositório.
- [x] Configurar React, TypeScript, Vite e pnpm.
- [x] Configurar FastAPI, uv, Ruff e mypy.
- [x] Configurar SQLAlchemy, Alembic e PostgreSQL no Docker Compose.
- [x] Implementar `/api/health` e `/api/ready`.
- [x] Configurar o tratamento de erros (Problem Details) e os logs estruturados.
- [ ] Configurar o pipeline de CI básico.
- [ ] Configurar a geração de tipos a partir do OpenAPI.
- [ ] **Publicar o esqueleto na Vercel, no Render e no Neon**, validando o rewrite e o cold start desde o início.

### 1.2. Fase 2 — Autenticação

- [ ] Implementar o modelo de usuários e sessões.
- [ ] Implementar cadastro e login com Argon2id.
- [ ] Implementar o cookie de sessão, a expiração e o logout.
- [ ] Implementar a proteção CSRF.
- [ ] Implementar o rate limiting no PostgreSQL.
- [ ] Implementar a alteração de senha.
- [ ] Implementar usuários demo efêmeros.
- [ ] Testar autenticação, autorização, CSRF e limites.

### 1.3. Fase 3 — Biblioteca pessoal

- [ ] Implementar o CRUD de links, coleções e tags, com FKs compostas.
- [ ] Implementar a associação entre links, coleções e tags.
- [ ] Implementar validação, pesquisa (`pg_trgm`), ordenação e paginação por cursor.
- [ ] Construir a interface principal da biblioteca.
- [ ] Garantir e testar o isolamento entre usuários.

### 1.4. Fase 4 — Compartilhamento público

- [ ] Implementar visibilidade pública e privada.
- [ ] Gerar slugs imprevisíveis, com invalidação ao revogar.
- [ ] Implementar endpoints públicos somente para leitura.
- [ ] Implementar a página pública da coleção, com pesquisa e filtros.
- [ ] Criar a coleção pública de exemplo no seed de produção.
- [ ] Testar o isolamento de informações privadas.

### 1.5. Fase 5 — Qualidade e entrega

- [ ] Completar os testes do backend e do frontend.
- [ ] Criar os testes end-to-end com Playwright.
- [ ] Implementar as mitigações de cold start na interface.
- [ ] Revisar segurança, headers e tratamento de erros.
- [ ] Escrever os ADRs e o `THREAT_MODEL.md`.
- [ ] Melhorar responsividade e acessibilidade.
- [x] Reescrever o README como apresentação do projeto e mover a especificação para `docs/SPEC.md`.

### 1.6. Fases pós-MVP

- [ ] **Fase 6 — Fluxos por e-mail:** recuperação de senha e verificação de e-mail com `one_time_tokens`, Mailpit em desenvolvimento e um provedor de e-mail em produção.
- [ ] **Fase 7 — Metadados de URL:** preenchimento automático de título e descrição, com proteção completa contra SSRF.
- [ ] **Fase 8 — Magic Link:** login sem senha como alternativa, reaproveitando a infraestrutura da fase 6.

Como estimativa inicial, o MVP pode ser organizado em aproximadamente quatro semanas, dependendo do tempo disponível. A autenticação, os testes e a integração entre os serviços podem exigir ajustes no cronograma.

## 2. Critérios de conclusão do MVP

O MVP será considerado concluído quando:

- [ ] A landing page apresentar claramente o propósito da aplicação e oferecer cadastro, login e acesso demo.
- [ ] A biblioteca e as páginas de coleções funcionarem em dispositivos móveis e desktops.
- [ ] Os estados de carregamento, vazio e erro estiverem implementados nas principais telas.
- [ ] A interface fornecer feedback após operações relevantes.
- [ ] Ações destrutivas e mudanças de visibilidade tiverem confirmações apropriadas.
- [ ] Coleções públicas e privadas possuírem indicadores visuais claros.
- [ ] Os resultados puderem ser ordenados por data, título e última atualização.
- [ ] A ordenação funcionar corretamente em conjunto com a pesquisa, os filtros e a paginação.
- [ ] Um usuário puder criar uma conta com e-mail e senha e entrar nela.
- [ ] Credenciais inválidas forem rejeitadas com mensagem genérica, e tentativas excessivas forem limitadas.
- [ ] Sessões puderem ser encerradas e expirarem conforme a política definida.
- [ ] O usuário puder criar, editar, consultar e excluir seus links.
- [ ] O usuário puder organizar links em coleções e tags.
- [ ] O usuário puder compartilhar uma coleção por URL e revogar o compartilhamento.
- [ ] Visitantes puderem acessar coleções públicas sem autenticação.
- [ ] Visitantes não puderem modificar coleções compartilhadas.
- [ ] Coleções privadas não puderem ser acessadas publicamente.
- [ ] Notas pessoais e outros campos privados não forem expostos.
- [ ] O sistema impedir que usuários acessem recursos de outras contas, inclusive no nível do banco.
- [ ] O contrato de API entre backend e frontend for verificado no CI.
- [ ] Os testes automatizados essenciais forem executados com sucesso.
- [ ] O ambiente puder ser iniciado usando Docker Compose.
- [ ] A demonstração pública estiver no ar, com conta demo e coleção pública de exemplo.
- [ ] O cold start for tratado na interface com aviso e retentativas.
- [ ] O README explicar instalação, configuração, testes e execução.

## 3. Funcionalidades futuras — fora do MVP

As funcionalidades abaixo podem ser consideradas após a conclusão da versão inicial:

- Recuperação de senha e verificação de e-mail.
- Login sem senha por Magic Link.
- Autenticação em dois fatores (TOTP).
- Tela de gerenciamento de sessões ativas.
- Extração automática de título, descrição e imagem de pré-visualização.
- Importação de favoritos do navegador via arquivo HTML.
- Exportação de dados para JSON ou CSV.
- Detecção de links duplicados.
- Verificação periódica de links quebrados.
- Extensão para navegador.
- Aplicação web progressiva (PWA).
- Sugestões automáticas de tags com IA.
- Catálogo global de coleções públicas.
- Descoberta e exploração de coleções públicas de outros usuários.
- Coleções aninhadas e recursos sociais.

Um catálogo global não faz parte do compartilhamento básico. No MVP, uma coleção pública só será acessível por meio de sua URL, sem necessariamente aparecer em uma listagem pública geral.

## 4. Resultado esperado

Ao final, o LinkVault deverá ser uma aplicação web full-stack funcional, containerizada, documentada e publicada em uma demonstração gratuita, na qual usuários possam gerenciar uma biblioteca pessoal de links com autenticação segura por e-mail e senha e compartilhar coleções com outras pessoas.

O projeto deve demonstrar domínio prático de React, TypeScript, Python, FastAPI, APIs REST com contrato tipado, PostgreSQL, autenticação baseada em sessões, segurança, testes automatizados, Docker e integração contínua.

O foco é entregar um MVP coeso, seguro, utilizável e fácil de demonstrar, em vez de acumular funcionalidades avançadas antes que os requisitos fundamentais estejam concluídos.
