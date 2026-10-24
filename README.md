# Dragon City Pixi

Reimplementação, para navegadores, do cliente **Android do Dragon City 2.0** (APK de 11/05/2013). O objetivo é ter o mesmo
visual, a mesma lógica e o mesmo protocolo de rede do original, tudo reconstruído a partir do próprio APK: o protocolo vem do
`libdc.so`, a interface dos arquivos `.ccbi` do CocosBuilder, e as imagens, fontes e textos dos assets do jogo.

> Projeto não oficial, feito por fãs, **sem fins lucrativos** e sem ligação com a Social Point. Veja o [aviso legal](#aviso-legal) e o
> arquivo [LICENSE](LICENSE).

## O que já funciona

* Cliente do protocolo mobile (assinatura HMAC `x-sp-sign`, login, fila de comandos de `/packet/execution`) e um **servidor de
  mentira** que roda dentro do Vite, com dados inventados onde o catálogo real não existe.
* Leitor de `.ccbi` (lê os 148 arquivos do APK), construtor de nós Pixi, botões, rótulos com a paleta original, popups e animações.
* Tela do logo, tela de carregamento com barra de progresso e escolha de login, HUD ligado aos recursos do jogador.
* Ilha isométrica com a projeção do motor original, chão, construções com a arte do APK, câmera (arrastar e zoom) e dragões que
  andam pelos caminhos dos habitats.
* Toque por máscara, menu da construção selecionada e modo mover (`move` enviado ao servidor).
* Textos em 8 idiomas (`de`, `en`, `es`, `fr`, `it`, `pl`, `pt_br`, `tr`).

O que falta e o que foi apenas suposto está em [`CLAUDE.md`](CLAUDE.md), [`docs/protocol.md`](docs/protocol.md) e [`docs/world.md`](docs/world.md).

## Como rodar

Requisitos: Node (testado com a versão 24) e um navegador com WebGL.

```
npm install
npm run dev
```

Abra `http://localhost:5173/`. Escolha **No Thanks** na tela de login (o login com Facebook não existe aqui). O primeiro carregamento
é lento no servidor de desenvolvimento; numa máquina sem GPU pode levar de 15 a mais de 40 segundos.

Parâmetros úteis: `?fresh` (pede o login de novo), `?lang=pt_br` (idioma), `?debug` (pegadas das construções), `?masks` (máscaras de toque),
`?ccb=CCB/MainMenu/HUD.ccbi` (mostra um `.ccbi`), `?world` (ilha de teste) e `?atlas=HD/Engine/s3tc/night_islands.plist` (quadros de um atlas).

Outros comandos:

```
npm run build                 # tsc -b && vite build
npx tsc -b                    # checagem de tipos
npx tsx --test <arquivos>     # testes (node:test), por exemplo src/game/world/iso.test.ts
```

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `src/game/network/mobile/` | cliente do protocolo do jogo |
| `mock-server/` | servidor de mentira (plugin do Vite) |
| `src/game/ccb/`, `src/game/atlas/` | leitor de `.ccbi`, nós Pixi, atlases, decodificador DXT |
| `src/game/screens/`, `src/game/session/`, `src/game/boot.ts` | telas, sessão e fluxo de inicialização |
| `src/game/world/` | ilha isométrica, dragões, máscaras de toque, menu e modo mover |
| `src/assets/` | assets do APK oficial (**não** MIT, veja abaixo) |
| `tools/re/` | scripts de engenharia reversa do `libdc.so` |
| `docs/` | notas sobre o protocolo e o mapa, e dumps brutos em `docs/re-output/` |

## Como o projeto foi feito

O `libdc.so` do APK não foi "stripped" (guarda milhares de nomes de funções), e isso permite ler como o jogo funciona. Os scripts em `tools/re/`
desmontam as funções (Capstone) e os resultados viraram código com testes contra os arquivos reais: por exemplo, o leitor de `.ccbi`
precisa terminar exatamente no último byte dos 148 arquivos, o decodificador DXT bate com o Pillow e todos os `.bin` de animação
são lidos por inteiro. Cada fato vem comentado com o símbolo e o endereço de onde foi tirado; o que é palpite fica marcado com **[?]**.

## Licença

O código e os textos originais deste projeto estão sob a [licença MIT](LICENSE). **Isso não vale para o material do jogo** nem para
dados extraídos do binário, descritos abaixo e no arquivo `LICENSE`.

## Aviso legal

* Este é um projeto de fãs, **não oficial**, sem ligação, autorização ou apoio da Social Point nem de quem publica o Dragon City.
  "Dragon City", "Social Point" e todos os nomes, logotipos e personagens relacionados pertencem aos seus donos.
* **Sem fins lucrativos.** Não há venda, anúncios, pagamentos nem monetização, e não há intenção de lucrar com o projeto. Ele existe
  para estudo, pesquisa, interoperabilidade e preservação do jogo. Por padrão ele fala só com o servidor de mentira incluído aqui,
  não com os servidores originais.
* **Não são MIT:** a pasta `src/assets/` (cópia sem alterações do `assets/` do APK oficial), os dumps de `docs/re-output/` (derivados
  do `libdc.so`), os fatos extraídos do binário e usados por compatibilidade (como a chave de assinatura e a paleta de cores dos
  rótulos), o código portado do cliente Flash decompilado (como `src/game/core/format.ts` e o código antigo em `src/game/core`,
  `engine`, `renderer`) e as dependências de terceiros, que mantêm as próprias licenças.
* O APK, o `libdc.so`, o cliente Flash decompilado e arquivos baixados dos servidores originais **não** fazem parte do repositório
  (estão no `.gitignore`) e não devem ser adicionados a ele. Se você for redistribuir ou fazer um fork, decida se pode manter
  `src/assets/`; o caminho mais seguro é removê-lo e usar a sua própria cópia obtida legalmente.
* O projeto é entregue "como está", sem garantia. Este aviso não é aconselhamento jurídico. Se você é titular de direitos e acha que
  algo aqui não deve ser distribuído, abra uma issue ou fale com o mantenedor, e o material será retirado.
