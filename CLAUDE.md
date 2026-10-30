# CLAUDE.md

Guia para quem trabalha neste repositório (pessoas e agentes). Estado em 2026-10-24.

## O que é

Reimplementação para navegadores do cliente **Android do Dragon City 2.0** (APK de 11/05/2013): mesmo visual, mesma lógica
e o mesmo protocolo de rede. A base é **só o APK**: o protocolo vem de `libdc.so`, a interface de `assets/CCB/*.ccbi`, as imagens,
fontes e textos de `src/assets`. O cliente Flash (`Base_sec_2.2.5`) está fora do escopo e fora do git.

Stack: Vite 8, React 19 (só como casca), Pixi.js 8, TypeScript 6. O servidor do jogo é um **servidor de mentira** (`mock-server/`)
que roda dentro do Vite; o catálogo real só existia no servidor da Social Point e não está no APK.

## Comandos

```
npm install
npm run dev                  # http://localhost:5173/ (também serve o servidor de mentira)
npm run build                # tsc -b && vite build
npx tsc -b                   # só checagem de tipos
npx tsx --test <arquivos>    # testes (node:test); não há script "test"
python -I tools/re/<script>.py   # engenharia reversa; precisa de capstone, pyelftools, itanium_demangler, Pillow
```

URLs úteis no dev server: `/` (fluxo completo), `/?fresh` (pede o login de novo), `/?lang=pt_br` (idioma),
`/?ccb=CCB/MainMenu/HUD.ccbi` (mostra um `.ccbi`), `/?atlas=HD/Engine/s3tc/night_islands.plist` (grade de quadros),
`/?world&masks` (ilha com pegadas, e `masks` pinta as máscaras de toque), `?debug` (pegadas no jogo).

Testes: um arquivo `*.test.ts` por módulo, ao lado dele. Rode todos com
`npx tsx --test src/game/**/*.test.ts mock-server/server.test.ts` (ajuste o glob ao seu shell).

## Mapa do código

| Pasta | O que faz |
|---|---|
| `src/game/network/mobile/` | cliente do protocolo (HMAC `x-sp-sign`, login, fila de comandos de `/packet/execution`) |
| `mock-server/` | servidor de mentira como plugin do Vite: `prelogin_config`, `/mobile/aio/login`, `/player/info`, `/packet/execution`; contas em `mock-server/data/` (ignorado) |
| `src/game/ccb/` | parser de `.ccbi` (CocosBuilder v3), construtor de nós Pixi, animações por keyframe, fontes BMFont, paleta dos rótulos |
| `src/game/atlas/` | `plist`/Starling, decodificador DXT em CPU (`dds.ts`), índice de assets (`assetFiles.ts`) |
| `src/game/locale/` | tabelas `locale_*.txt` (a chave é o texto em inglês) |
| `src/game/screens/` | telas ligadas aos dados: `CCBView` (controlador, como o CocosBuilder), HUD, popups, tela de carregamento |
| `src/game/session/` | `GameSession` (login, `GameStore`) e figuras do HUD a partir do nó `user` |
| `src/game/world/` | ilha isométrica: projeção, chão, construções, dragões (esqueletos), máscaras de toque, câmera, menu e modo mover |
| `src/game/boot.ts` | logo, escolha de login, barra de carregamento |
| `src/game/core`, `engine`, `renderer`, `GamePlayer.tsx` | código **antigo** da época do Flash; não usado pelo fluxo novo |
| `tools/re/` | scripts de disassembly (`rdis.py`, `xref.py`, `palette.py`…) |
| `docs/` | `protocol.md` (rede), `world.md` (mapa, dragões, máscaras, menu), `re-output/` (dumps brutos) |

Detalhes do que já funciona e do que foi inferido estão em `docs/protocol.md` e `docs/world.md`; itens marcados **[?]** são suposições.

## Convenções

* Código: TypeScript estrito, 4 espaços, sem ponto e vírgula, aspas duplas, comentários e identificadores em inglês.
  Documentação e mensagens para o usuário deste repositório em português.
* Comentários dizem o **porquê** e citam o símbolo e o endereço do `libdc.so` de onde veio o fato (`@0x5c988c`).
* Módulos testados em Node não podem importar `assetFiles.ts` (usa `import.meta.glob`): mantenha a lógica pura em arquivos
  separados (por exemplo `locale.ts` x `loadLocale.ts`, `touchMask.ts` x `touchMaskLoader.ts`).
* Importe com extensão `.ts` nos arquivos de teste e no `mock-server/` (o Vite carrega a configuração nativamente).
* Cada fato recuperado do binário ganha um teste contra os arquivos reais do APK quando possível (o parser de `.ccbi` lê os 148
  arquivos até o último byte; o DXT bate com o Pillow; os `.bin` de animação também).
* Commits pequenos e por assunto, em inglês, no imperativo, com corpo explicando o porquê. Não commite `dist/` nem `mock-server/data/`.
* Coordenadas: o cocos usa y para cima, o Pixi y para baixo. Os módulos de mundo trabalham em y para baixo e convertem na borda.

## Armadilhas conhecidas

* **O Vite deixa de notar arquivos alterados** (módulos velhos, carregamentos presos). Se algo parecer travar, reinicie `npm run dev`
  antes de investigar.
* O carregamento no dev server é lento (centenas de requisições; o Chrome sem GPU renderiza por software e disputa a CPU):
  de 15 a mais de 40 s numa máquina ocupada. Em testes automáticos espere até `window.game` existir.
* O WebGL recusa DXT com altura que não é múltipla de 4; por isso o `.dds` é decodificado em CPU. Não volte para o carregador DDS do Pixi.
* Não use `destroy({ children: true })` em telas que compartilham texturas; remova do palco (`removeFromParent`).
* O Pixi decodifica imagens em workers por padrão; isso está desligado (`Assets.setPreferences({ preferWorkers: false })`).

## Premissas do servidor de mentira (a conferir)

* `gold` está em `playerInfo`: o parser recuperado de `PlayerInfo::parsePlayerInfo` não lista chave para ouro.
* O estado privado (`goals`, `gifts`, `bonusNextId`…) fica na raiz de `user`; os dragões em `map.ownedDragons` com `type` (id do item)
  e `habitatId`; `map.items` usa a forma `[itemId, x, y, parentId, frame, flag, atributos]`.
* `config.levels` é um objeto indexado pelo nível, com `xp_required` e `xp_needed`; a curva de XP e o catálogo
  (`mock-server/catalog.ts`) são inventados. Ids e tamanhos dos itens seguem a arte que o APK traz (1 incubadora, 16 fazenda, 26 habitat de terra).
* Só `level_up`, `sell`, `complete_tutorial`, `win_daily_bonus`, `set_login_rewarded` e `move` mudam o estado; os outros comandos só são confirmados.

## Pendências

* Facebook: o botão fica desabilitado; só existe o login sem Facebook.
* Menu da construção: MOVE age e INFO abre o popup de venda (`PlaceSellPopUpView`, comando `sell`; o valor, metade do custo, é suposição). UPGRADE, GROW FOOD, BREED, BUY EGG etc. aparecem e ainda não têm popup nem comando.
  O estado da construção (parada, pronta, trabalhando) está fixo em "parada".
* Dragões: só o estágio 1 do dragão de terra (1011) tem arte no APK; a fase real deveria vir do nível
  (`DragonUtils::getDragonEvolutionByLevel`). Sem toque nos dragões além da caixa do esqueleto; velocidade de 30 quadros/s é suposição.
* Terreno construível (`Map::isConstructibleTile`) e expansões (`expansionsImages`) não existem; só se recusa sobrepor construções.
* Rótulos: espessura do contorno estimada; `CCLayerGradient` usa só a cor inicial; `CCClippingNode` não recorta; `SPAnimatedSprite` mostra o primeiro quadro.
* Texturas: só as pastas `s3tc` (DXT) e PNG são lidas; `etc1`, `atitc` e `pvr` não. Alguns atlases não vêm legíveis no APK
  (`starter_package_assets` só em PVRTC, `PirateIsland_Assets` ausente).
* Nomes semânticos dos argumentos dos comandos e o formato do `result` de cada um (ver `docs/protocol.md` §4 e §7).

## Próximos passos sugeridos

1. Popups e comandos dos botões do menu que faltam (UPGRADE, GROW FOOD, BREED, BUY EGG…).
2. Loja, expansões do terreno (`CCB/Store`, `expansionsImages`) e mercado de dragões (`CCB/DragonMarket`) ligados a `buy`, `sell`, `move`.
3. Ovos, chocar e procriação (`CCB/Breeding`) com `breed_dragon_2`, `finish_breeding_2`, `hatch_egg`.
4. Tutorial e metas (`CCB/Tutorial`, `config.goals`).

## Material do jogo

`src/assets/` é cópia sem alterações do `assets/` do APK oficial e **não** é MIT; veja `LICENSE`. Não adicione ao repositório arquivos
baixados dos servidores da Social Point nem o `.apk`, o `libdc.so` ou os `.as` do cliente Flash (estão no `.gitignore`).
