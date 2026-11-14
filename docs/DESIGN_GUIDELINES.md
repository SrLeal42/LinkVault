# LinkVault — Diretrizes de Identidade Visual e UI/UX

> **Status:** direção visual aprovada para orientar a implementação do frontend  
> **Versão:** 1.0  
> **Idioma da interface:** português (pt-BR)  
> **Referência complementar:** `docs/SPEC.md` e `docs/DEVELOPMENT.md`

Este documento registra as decisões visuais e de experiência do usuário definidas para o LinkVault. Ele deve servir como referência durante a implementação de páginas, componentes e estados da interface.

A especificação técnica e de produto continua sendo a fonte de verdade para o escopo e o comportamento funcional. Este documento complementa essa especificação com a linguagem visual esperada, sem introduzir funcionalidades novas por conta própria.

---

## 1. Direção visual

### 1.1. Conceito

A identidade do LinkVault combina **Editorial Swiss** com **Digital Archive**: a atmosfera de um arquivo ou catálogo editorial, organizada por uma estrutura funcional, minimalista e rigorosa.

A aplicação deve lembrar uma biblioteca digital de referências cuidadosamente organizada — não um dashboard SaaS genérico, um terminal ou um arquivo histórico literal.

A personalidade visual deve vir principalmente de:

- tipografia e hierarquia de informação;
- organização em grid e alinhamentos consistentes;
- tons quentes inspirados em papel e materiais impressos;
- divisores, bordas e superfícies bem dosados;
- apresentação intencional de títulos, domínios, datas, categorias e quantidades;
- interações claramente identificáveis e feedbacks discretos.

A interface deve parecer um produto coeso. Não devemos adicionar efeitos ou elementos decorativos apenas para demonstrar técnicas de frontend.

### 1.2. Princípios

1. **Funcionalidade antes da decoração.** Cada elemento deve ajudar a compreender, navegar, organizar ou executar uma ação.
2. **Personalidade pela composição.** A identidade vem do uso consistente de tipografia, grid, cor e metadados — não do acúmulo de efeitos.
3. **Interatividade evidente.** Elementos clicáveis devem parecer clicáveis mesmo antes de receber hover.
4. **Conteúdo em primeiro lugar.** Títulos, descrições, domínios e imagens dos links devem ser mais importantes que os adornos da interface.
5. **Densidade adequada ao contexto.** Páginas públicas têm mais espaço e foco editorial; áreas privadas podem apresentar mais informação simultaneamente.
6. **Consistência sem rigidez.** As páginas podem ter composições diferentes, mas devem compartilhar os mesmos tokens, componentes e padrões de interação.
7. **Acessibilidade desde o início.** Contraste, teclado, foco, semântica e áreas de toque fazem parte do design, não são ajustes finais.

---

## 2. Paleta de cores

### 2.1. Direção

O tema padrão é **claro e quente**, com predominância de amarelo-bege e tons de papel envelhecido. A interface não deve utilizar branco puro como fundo dominante.

A paleta deve transmitir acolhimento e uma atmosfera editorial, sem parecer sépia, vintage ou excessivamente amarelada. O texto principal utiliza um grafite quente para manter legibilidade e contraste.

### 2.2. Cores-base

| Token | Cor | Uso principal |
|---|---|---|
| `--color-paper` | `#E9DFC8` | Fundo geral da aplicação (canvas). |
| `--color-surface` | `#F0E7D4` | Superfícies de conteúdo, formulários e áreas elevadas em relação ao fundo. |
| `--color-archive` | `#D9CEB7` | Superfícies secundárias, realces discretos e elementos de apoio. |
| `--color-divider` | `#C8BBA2` | Bordas, linhas divisórias e separação de grupos. |
| `--color-ink` | `#302E26` | Títulos e textos principais. |
| `--color-muted` | `#777568` | Elementos secundários, ícones discretos e detalhes não essenciais. |
| `--color-muted-text` | `#665F50` | Texto secundário pequeno, quando for necessário manter contraste mais alto. |
| `--color-accent` | `#A45D43` | Destaques editoriais, pequenos indicadores e detalhes de identidade. |
| `--color-accent-strong` | `#854832` | Ações principais, links ou estados de foco que precisem de maior contraste. |

As cores são tokens semânticos: componentes devem consumi-las por meio das variáveis centralizadas, evitando valores hexadecimais repetidos em CSS Modules.

### 2.3. Hierarquia de superfícies

Organizar a interface em níveis sutis:

- **Canvas:** `Paper`, como fundo predominante.
- **Surface:** `Soft Paper`, para áreas de conteúdo e controles.
- **Surface secundária:** `Archive`, para agrupamentos ou realces discretos.
- **Divisores:** `Divider`, para separar áreas sem criar caixas excessivas.

Não é necessário colocar cada componente em uma superfície própria. A hierarquia também pode ser construída com espaçamento, alinhamento e linhas divisórias.

### 2.4. Regras de uso e contraste

- Não utilizar branco puro como fundo principal.
- Não utilizar o terracota em grandes áreas sem necessidade.
- Reservar `Accent` para poucos pontos de atenção; não colorir todas as tags ou todos os ícones.
- Para botões preenchidos com texto claro, preferir `Accent Strong`.
- Para textos secundários pequenos, preferir `Muted Text` em vez de `Muted` quando o contraste de `Muted` não for suficiente.
- Não depender apenas da cor para indicar estado, erro, sucesso, visibilidade ou interatividade.
- Validar o contraste dos pares reais de texto e fundo durante a implementação, inclusive em hover, foco, desabilitado e erro.

---

## 3. Tipografia

### 3.1. Direção tipográfica

A interface utilizará predominantemente uma **fonte sem serifa**. A personalidade editorial deve vir da escala, do peso, do espaçamento e da hierarquia — não é necessário utilizar uma fonte serifada.

Sugestão inicial a validar na implementação:

- **Archivo:** fonte principal para títulos, textos, navegação, botões e formulários.
- **IBM Plex Mono:** fonte auxiliar, utilizada com moderação em metadados, datas, contagens e identificadores curtos.

A escolha final deve priorizar legibilidade, boa renderização em diferentes tamanhos e consistência entre as telas.

### 3.2. Hierarquia

- **Títulos de página:** fortes e fáceis de localizar, sem ocupar espaço excessivo.
- **Títulos de coleções e links:** devem ter destaque suficiente para serem reconhecidos como conteúdo e, quando aplicável, como ações clicáveis.
- **Descrições:** menores e visualmente subordinadas aos títulos.
- **Metadados:** compactos, com contraste suficiente e tratamento consistente.
- **Rótulos de campos e botões:** claros e diretos.

A fonte monoespaçada não deve ser utilizada em parágrafos, títulos principais ou em toda a interface.

### 3.3. Formatação de metadados

Adotar padrões consistentes para informações secundárias. Exemplos:

- Data: `14 NOV 2026`.
- Seção: `MINHA BIBLIOTECA / COLEÇÕES`.
- Categoria: `DOCUMENTAÇÃO`.
- Contagem: `024 LINKS`.
- Domínio: `fastapi.tiangolo.com`.

Os exemplos são referências de estilo. O conteúdo apresentado ao usuário deve permanecer em português. Abreviações de data devem seguir uma convenção pt-BR consistente.

---

## 4. Grid, espaçamento e forma

### 4.1. Grid

- Utilizar uma estrutura de grid consistente entre páginas.
- Alinhar títulos, descrições, ferramentas de pesquisa e conteúdo principal.
- Manter uma hierarquia previsível entre navegação, cabeçalho da página e área de conteúdo.
- Em telas grandes, aproveitar a largura disponível sem esticar linhas de texto excessivamente.
- Nas telas pequenas, priorizar uma coluna e reorganizar a navegação sem rolagem horizontal.

### 4.2. Espaçamento

Utilizar uma escala de espaçamento consistente, preferencialmente baseada em múltiplos de 4 ou 8 px. A densidade deve ser controlada pelo contexto da página, não por espaçamentos arbitrários entre componentes semelhantes.

### 4.3. Bordas e cantos

- Preferir bordas finas e discretas a sombras pesadas.
- Utilizar cantos levemente arredondados, sem transformar todos os elementos em pílulas.
- Reservar cartões e superfícies delimitadas para componentes que realmente formem uma unidade de conteúdo ou ação.
- Não usar cartões como solução automática para cada linha, campo ou seção.

### 4.4. Profundidade

A profundidade deve vir principalmente da diferença entre canvas, superfícies e bordas. Sombras podem existir em menus e diálogos quando ajudarem a indicar sobreposição, mas devem ser discretas.

---

## 5. Interatividade e elementos clicáveis

**Esta seção é especialmente importante:** simplicidade visual não deve fazer a interface parecer estática. O usuário precisa reconhecer rapidamente o que pode abrir, selecionar, editar ou executar.

### 5.1. Regra geral de affordance

Todo elemento interativo deve apresentar pelo menos uma pista visual clara em seu estado normal, sem depender exclusivamente de hover. Conforme o componente, isso pode incluir:

- aparência de botão, com preenchimento ou borda perceptível;
- título com tratamento visual de link;
- ícone vetorial de navegação ou abertura;
- superfície delimitada que indique uma unidade clicável;
- rótulo de ação explícito, como “Abrir coleção” ou “Adicionar link”.

O hover reforça a affordance, mas não deve ser a única maneira de descobrir a interação.

### 5.2. Links salvos

- O título deve ser visualmente reconhecível como link, e não apenas como texto comum.
- A área principal de conteúdo pode funcionar como alvo para abrir o endereço original, desde que as ações de gerenciamento permaneçam claramente separadas.
- Mostrar o domínio como informação secundária, sem competir com o título.
- Utilizar um indicador vetorial discreto de abertura externa quando isso ajudar a explicar o destino da ação.
- O estado de hover deve realçar a área clicável com alteração sutil de fundo, borda ou tratamento do título.
- Em teclado, o foco deve ser evidente e alcançar o link e cada ação separadamente.
- Em dispositivos de toque, as ações essenciais não podem depender de hover.

Evitar áreas clicáveis ambíguas ou elementos interativos aninhados de maneira inválida. Se a linha inteira for um link, os botões de edição e exclusão devem ficar fora desse alvo interativo.

### 5.3. Coleções

Coleções devem parecer unidades navegáveis, e não apenas títulos em uma lista de texto.

- O nome da coleção deve ter destaque tipográfico.
- A área de abertura deve apresentar uma superfície, borda ou separação suficientemente clara.
- Um indicador de navegação (por exemplo, uma seta vetorial) deve reforçar que a coleção pode ser aberta.
- Quando necessário, incluir um rótulo explícito como “Abrir coleção”.
- O estado de hover deve reforçar a área clicável sem alterar drasticamente a composição.
- Ações administrativas, como editar, compartilhar ou excluir, devem ser visualmente distintas da ação de abrir.

A listagem pode usar linhas em vez de cartões, desde que cada linha tenha uma affordance clara.

### 5.4. Botões e controles

- A ação principal de cada contexto deve ser facilmente identificável.
- Ações secundárias podem utilizar borda ou estilo textual, mas ainda precisam parecer interativas.
- Ações destrutivas devem ter tratamento visual distinto e confirmação apropriada.
- Campos, seletores, menus e controles precisam indicar claramente seu estado e sua possibilidade de interação.
- Estados desabilitados devem parecer desabilitados, sem depender apenas de redução de opacidade.

### 5.5. Estados de interação

Definir e implementar, de forma consistente:

- padrão;
- hover (quando houver dispositivo compatível);
- foco visível por teclado;
- pressionado/ativo;
- selecionado;
- desabilitado;
- carregando;
- erro, quando aplicável.

As diferenças devem ser perceptíveis, mas discretas. O foco visível não pode ser removido sem substituição acessível.

---

## 6. Apresentação de links e imagens

Links podem possuir apenas título, domínio e descrição, ou também uma imagem associada. O layout deve funcionar bem nos dois cenários.

### 6.1. Hierarquia do item

A ordem de importância recomendada é:

1. título do link;
2. domínio ou endereço de origem;
3. descrição;
4. tags e coleção associada;
5. data e demais metadados;
6. imagem, quando disponível, como apoio visual — sem competir com o título.

A hierarquia pode ser adaptada para a composição, mas o título deve permanecer facilmente identificável.

### 6.2. Imagem opcional

Quando houver uma imagem associada ao link:

- apresentá-la como miniatura ou prévia, sem fazer dela o elemento dominante;
- manter proporções consistentes dentro de um mesmo contexto;
- utilizar `object-fit: cover` quando a imagem for uma miniatura editorial;
- evitar que imagens de dimensões diferentes desorganizem a listagem;
- não exigir que todo link possua imagem;
- não exibir espaços vazios grandes quando uma imagem não estiver disponível.

Quando não houver imagem, o item deve continuar visualmente completo, sem parecer quebrado. O domínio, título e metadados precisam sustentar a composição. Um favicon ou identificador vetorial simples pode ser utilizado como complemento quando disponível, mas não deve ser obrigatório.

### 6.3. Comportamento por contexto

- **Biblioteca privada:** priorizar uma apresentação compacta. Miniaturas pequenas podem ajudar a diferenciar referências, sem reduzir a quantidade de itens visíveis.
- **Coleções privadas:** permitir um pouco mais de espaço para imagem quando isso ajudar a reconhecer ou organizar o conteúdo.
- **Coleções públicas:** oferecer uma apresentação mais editorial, com miniaturas um pouco mais generosas quando existirem imagens disponíveis.
- **Telas pequenas:** reduzir ou ocultar miniaturas secundárias quando necessário, preservando o título e as ações principais.

### 6.4. Limite de escopo

A interface deve estar preparada para exibir imagens quando esses dados estiverem disponíveis. Isso **não significa adicionar automaticamente ao MVP a extração de metadados, thumbnails ou imagens externas**. A obtenção automática de metadados de URL permanece sujeita à fase futura e aos requisitos de segurança contra SSRF definidos na especificação do produto.

Em páginas públicas, exibir somente imagens e campos disponibilizados pelo contrato público da API. Nunca expor notas pessoais ou outros dados privados por causa da apresentação visual.

---

## 7. Tags, metadados e visibilidade

### 7.1. Tags

- Utilizar aparência de etiqueta: fundo discreto, borda fina e texto compacto.
- Manter uma paleta uniforme; não atribuir uma cor arbitrária a cada tag.
- Tags clicáveis devem ter affordance própria, como hover, foco e cursor apropriado.
- Não confundir uma tag informativa com um filtro selecionado.
- O estado selecionado de um filtro deve ser visualmente distinto do estado normal da tag.

### 7.2. Metadados

Domínios, datas, quantidades e categorias ajudam a construir a linguagem editorial do produto. Devem ser compactos e consistentes, mas legíveis. Não usar metadados como decoração excessiva ou criar informações que o sistema não possui.

### 7.3. Visibilidade

Os estados **Pública** e **Privada** devem ser identificáveis sem depender apenas da cor.

- Pública: ícone vetorial de compartilhamento ou globo, acompanhado do texto “Pública”.
- Privada: ícone vetorial de cadeado, acompanhado do texto “Privada”.
- A mudança de visibilidade deve ter confirmação que explique a consequência.
- Uma coleção pública deve facilitar a cópia do endereço compartilhável.
- A interface deve informar claramente quando o compartilhamento for revogado.

Para usuários demo, respeitar as restrições funcionais definidas na especificação. A apresentação visual de um controle desabilitado deve explicar o motivo.

---

## 8. Ícones, símbolos e elementos gráficos

### 8.1. Sem emojis

**Não utilizar emojis na interface, em botões, estados vazios, mensagens, tags ou elementos de navegação.** Eles introduzem variação visual entre sistemas e não combinam com a linguagem editorial definida.

### 8.2. Preferência por SVG

- Preferir ícones vetoriais SVG, com traço e proporções consistentes.
- Uma biblioteca de ícones pode ser utilizada se produzir SVG e permitir controlar tamanho, espessura e alinhamento.
- Ícones devem ter função reconhecível: abrir, editar, excluir, pesquisar, filtrar, compartilhar, copiar, navegar etc.
- Ações importantes devem ter texto junto ao ícone quando o significado não for universal.
- Ícones decorativos não devem competir com o conteúdo.

### 8.3. ASCII e caracteres

Caracteres ASCII simples podem ser usados em identificadores, separadores ou detalhes editoriais quando forem claros e consistentes. Não depender de caracteres Unicode ambíguos para representar ícones ou ações. Para símbolos de interface, preferir SVG.

### 8.4. Elementos gráficos

Linhas, numeração, divisores e pequenos marcadores podem reforçar a estética de arquivo. Seu uso deve ajudar a estruturar conteúdo, não preencher espaços vazios sem propósito.

---

## 9. Linguagem e conteúdo

### 9.1. Idioma

Toda a interface voltada ao usuário deve estar em **português brasileiro (pt-BR)**: navegação, botões, formulários, mensagens, confirmações, estados vazios, erros e notificações.

Nomes próprios, marcas, títulos originais de páginas salvas, URLs e domínios devem ser preservados conforme sua origem.

### 9.2. Tom de voz

- direto, claro e cordial;
- frases curtas;
- instruções que expliquem a ação ou consequência;
- evitar jargões quando não forem necessários;
- evitar mensagens genéricas como “Ocorreu um erro” quando for possível orientar a correção.

### 9.3. Exemplos de microcopy

| Contexto | Texto sugerido |
|---|---|
| Ação principal | `Adicionar link` |
| Abrir coleção | `Abrir coleção` |
| Link copiado | `Link copiado.` |
| Compartilhamento | `Coleção compartilhada.` |
| Revogação | `O compartilhamento foi desativado.` |
| Biblioteca vazia | `Sua biblioteca ainda está vazia.` |
| Pesquisa sem resultados | `Nenhum link corresponde à pesquisa.` |
| Carregamento inicial | `Estamos iniciando o servidor. Isso pode levar alguns instantes.` |
| Erro recuperável | `Não foi possível carregar os links. Tentar novamente` |

Esses textos são sugestões e podem ser ajustados durante a implementação, mantendo o tom e o idioma.

---

## 10. Aplicação da identidade por página

A identidade deve permanecer consistente, mas a densidade e a composição podem mudar conforme a finalidade da página.

### 10.1. Landing page

**Direção:** editorial, espaçosa e introdutória.

- Apresentar o nome e a proposta do LinkVault com clareza.
- Utilizar título de destaque e descrição curta.
- Demonstrar visualmente a organização de links e coleções sem transformar a página em um dashboard completo.
- Dar destaque evidente às ações de cadastro, login e acesso demo.
- Apresentar o compartilhamento público e um exemplo de coleção.
- Manter a composição leve e responsiva.
- Preservar o fundo em tom de papel, com textura apenas se for extremamente sutil.

### 10.2. Biblioteca pessoal

**Direção:** funcional, organizada e relativamente densa.

- Utilizar navegação clara para biblioteca, coleções e tags.
- Dar destaque à pesquisa e aos controles de filtro e ordenação.
- Apresentar links em linhas ou grupos compactos, com títulos claramente clicáveis.
- Exibir domínio, descrição, tags, coleção e datas conforme disponibilidade e espaço.
- Acomodar miniaturas opcionais sem tornar a listagem excessivamente alta.
- Oferecer uma ação principal clara para adicionar um link.
- Separar a abertura de um link das ações de edição e exclusão.
- Exibir indicador discreto de conta demo quando aplicável.

### 10.3. Coleções privadas

**Direção:** catálogo organizado, com densidade intermediária.

- Apresentar nome, descrição, quantidade de links e visibilidade.
- Tornar a ação de abrir cada coleção evidente.
- Separar abrir, editar, compartilhar, revogar e excluir.
- Facilitar a identificação de coleções públicas e privadas.
- Explicar as consequências de tornar uma coleção pública ou privada.

### 10.4. Página de uma coleção privada

**Direção:** biblioteca contextual.

- Apresentar o nome e a descrição da coleção.
- Manter os controles de pesquisa, filtro e ordenação próximos da listagem.
- Exibir links com a mesma linguagem da biblioteca pessoal.
- Preservar as ações de gerenciamento para o proprietário autorizado.
- Acomodar imagens opcionais de maneira consistente.

### 10.5. Página pública de uma coleção

**Direção:** editorial e confortável para leitura e exploração.

- Apresentar nome e descrição da coleção com destaque.
- Indicar claramente que a coleção é pública.
- Permitir pesquisa, filtros e ordenação previstos no produto.
- Apresentar os links como conteúdo navegável e somente para leitura.
- Não exibir controles administrativos.
- Oferecer uma maneira discreta de conhecer o LinkVault ou retornar à página inicial.
- Acomodar imagens opcionais sem exigir que todos os links tenham miniaturas.

### 10.6. Página de tags

**Direção:** catálogo compacto.

- Facilitar a leitura e a localização das tags.
- Dar destaque às ações de criar, renomear e excluir.
- Quando possível, apresentar a quantidade de links associados, se esse dado estiver disponível.
- Tornar evidente quando uma tag pode ser selecionada para filtrar a biblioteca.

---

## 11. Estados da interface e feedback

A identidade visual também deve estar presente nos estados de carregamento, vazio, erro e confirmação.

### 11.1. Carregamento

- Utilizar skeletons ou placeholders proporcionais ao conteúdo esperado.
- Evitar bloquear a página inteira quando apenas uma seção estiver carregando.
- Indicar processamento em botões e formulários.
- Evitar envios duplicados durante operações em andamento.
- Tratar o cold start do backend com aviso compreensível e tentativas automáticas conforme a especificação.

### 11.2. Estados vazios

Diferenciar claramente:

- biblioteca sem links;
- coleção sem links;
- nenhuma coleção criada;
- nenhuma tag criada;
- pesquisa sem resultados.

Sempre que possível, oferecer uma ação que ajude a continuar — adicionar link, criar coleção ou limpar filtros. A apresentação deve utilizar tipografia, composição e texto; não depender de ilustrações decorativas ou emojis.

### 11.3. Erros

- Utilizar mensagens em português e linguagem compreensível.
- Identificar o campo que precisa de correção quando houver erro de validação.
- Oferecer nova tentativa para falhas recuperáveis.
- Diferenciar indisponibilidade temporária, cold start, sessão expirada e erro definitivo.
- Nunca expor stack traces, detalhes internos do servidor ou informações privadas.

### 11.4. Confirmações e notificações

- Utilizar feedback discreto próximo da ação ou em notificações temporárias.
- Confirmar ações destrutivas e alterações importantes de visibilidade.
- Explicar a consequência antes de tornar uma coleção pública ou revogar seu acesso.
- Não exigir confirmação para toda ação simples.
- Utilizar a mesma linguagem visual e verbal em toda a aplicação.

---

## 12. Responsividade e acessibilidade

### 12.1. Responsividade

- A interface deve funcionar em desktop, tablet e celular.
- Não permitir rolagem horizontal da página em larguras comuns.
- Adaptar navegação lateral, listas, filtros, formulários e diálogos.
- Manter ações principais acessíveis por toque.
- Não depender de hover para revelar uma ação essencial.
- Reduzir ou reorganizar metadados e imagens secundárias em telas pequenas, sem ocultar o título ou as ações fundamentais.

### 12.2. Acessibilidade

- Utilizar HTML semântico e controles nativos sempre que apropriado.
- Garantir navegação por teclado e foco visível.
- Fornecer nomes acessíveis para controles que utilizem apenas ícones.
- Não comunicar estados somente por cor.
- Manter contraste adequado em todos os estados.
- Associar mensagens de erro aos respectivos campos.
- Garantir comportamento adequado de foco em diálogos e menus.
- Anunciar feedbacks dinâmicos com mecanismos apropriados (`aria-live`, quando aplicável).
- Respeitar `prefers-reduced-motion` e evitar animações desnecessárias.

---

## 13. Movimento e transições

O movimento deve ser funcional e discreto.

- Utilizar transições curtas para hover, foco, abertura de menus e feedbacks.
- Uma duração aproximada de 150–200 ms pode servir como ponto de partida para mudanças simples de cor ou fundo.
- Evitar animações constantes, parallax, elementos flutuantes ou transições que atrasem ações.
- Não animar elementos apenas para preencher a tela.
- Respeitar a preferência por redução de movimento do sistema operacional.

---

## 14. Diretrizes negativas — o que evitar

Estas restrições devem ser consideradas durante o design, a implementação e a revisão de telas. Elas também podem ser reutilizadas como prompt negativo em ferramentas de geração de interface.

**Evitar:**

- glassmorphism excessivo e superfícies translúcidas sem função;
- gradientes exagerados, brilhos, neon e efeitos luminosos;
- fundo branco puro como tema predominante;
- cartões para absolutamente todos os elementos;
- cantos exageradamente arredondados e elementos em formato de pílula sem necessidade;
- sombras pesadas e profundidade artificial;
- emojis em qualquer parte da interface;
- ícones decorativos ou sem função reconhecível;
- símbolos Unicode ambíguos usados como substitutos improvisados de ícones;
- animações em cada interação, parallax e transições excessivas;
- uso exagerado de fontes monoespaçadas;
- gráficos, métricas ou estatísticas artificiais que não correspondam a necessidades reais do produto;
- ilustrações, blobs, elementos flutuantes e ornamentos sem propósito;
- layouts genéricos de SaaS ou composições facilmente reconhecíveis como templates;
- títulos, links, coleções ou ações clicáveis que pareçam texto estático;
- ações essenciais reveladas somente por hover;
- miniaturas grandes que empurrem o conteúdo principal para segundo plano;
- efeitos que disputem atenção com títulos, descrições e informações úteis;
- qualquer detalhe que reduza legibilidade, acessibilidade ou desempenho.

### Prompt negativo resumido

> Não utilizar emojis. Não utilizar glassmorphism, gradientes exagerados, neon, sombras pesadas, cartões para tudo, cantos excessivamente arredondados, animações constantes, parallax, ícones decorativos, fontes monoespaçadas em excesso, gráficos artificiais, blobs ou elementos flutuantes. Evitar branco puro, templates SaaS genéricos e efeitos sem função. Não fazer links e coleções clicáveis parecerem texto estático. Não depender apenas de hover para indicar interatividade. Preferir ícones SVG consistentes ou caracteres ASCII simples quando apropriado.

---

## 15. Critérios de revisão visual

Antes de considerar uma página pronta, verificar:

### Identidade
- [ ] A página utiliza a paleta quente de papel e bege.
- [ ] A hierarquia tipográfica está clara e consistente.
- [ ] O grid e os alinhamentos seguem os padrões da aplicação.
- [ ] A composição parece pertencer ao LinkVault, e não a um template genérico.

### Interatividade
- [ ] É fácil identificar o que é clicável sem depender de hover.
- [ ] Links e coleções apresentam affordances claras.
- [ ] Ações de abrir, editar e excluir estão visualmente separadas.
- [ ] Hover, foco, ativo, selecionado e desabilitado possuem estados adequados.
- [ ] A interface funciona por teclado e toque.

### Conteúdo
- [ ] A interface está em português brasileiro.
- [ ] Títulos e domínios têm hierarquia adequada.
- [ ] Imagens opcionais não prejudicam a composição quando estão ausentes.
- [ ] Imagens disponíveis têm tamanho e proporção consistentes.
- [ ] Metadados apresentados correspondem a dados realmente disponíveis.
- [ ] Nenhuma informação privada aparece em páginas públicas.

### Qualidade
- [ ] A página é responsiva.
- [ ] Estados de carregamento, vazio e erro foram considerados.
- [ ] Contraste e foco visível foram verificados.
- [ ] Não há emojis ou elementos decorativos sem função.
- [ ] Não há animações ou efeitos desnecessários.

---

## 16. Relação com a especificação do produto

Este guia não altera os requisitos funcionais definidos em `docs/SPEC.md` nem o planejamento de `docs/DEVELOPMENT.md`.

Em especial:

- pesquisa, filtros, ordenação e paginação continuam seguindo a especificação;
- a interface pública continua sendo somente para leitura;
- o backend permanece responsável por autenticação, autorização e isolamento;
- notas pessoais e demais dados privados nunca podem ser exibidos em páginas públicas;
- a obtenção automática de metadados e imagens de URLs continua fora do MVP, salvo decisão explícita de escopo;
- estados de carregamento, vazio, erro, confirmação, responsividade e acessibilidade continuam sendo requisitos da experiência.

**Objetivo final:** construir uma interface simples, funcional e reconhecível, cuja personalidade venha da apresentação cuidadosa do conteúdo e da consistência dos detalhes — não da quantidade de efeitos visuais.
