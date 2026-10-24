# Próximos passos — cliente web do Dragon City (APK Android 2.0)

Estado em 2026-10-24. A base é só o **APK**: o protocolo vem de `libdc.so`, a UI de `assets/CCB/*.ccbi`,
as imagens/fontes/textos de `src/assets`. O cliente Flash (`Base_sec_2.2.5`) está fora do escopo.

## O que já funciona

| Área | Onde | Estado |
|---|---|---|
| Protocolo mobile (assinatura HMAC, login, `/packet/execution`) | `src/game/network/mobile/` | cliente tipado, 6 testes |
| Servidor de mentira | `mock-server/` | roda dentro do Vite; `prelogin_config`, `/mobile/aio/login`, `/player/info`, `/packet/execution` assinados; contas por dispositivo em `mock-server/data/` (ignorado pelo git) |
| Parser `.ccbi` (CocosBuilder v3) | `src/game/ccb/reader.ts` | lê os 148 arquivos até o último byte |
| Construtor de nós Pixi | `src/game/ccb/build.ts` | sprites, nine-slice, rótulos, botões, camadas, fundo de popup, animações por keyframe |
| Atlas (`plist` e Starling) | `src/game/atlas/` | frames, trim e rotação |
| Paleta de cores dos rótulos | `src/game/ccb/palette.ts` | extraída de `libdc.so` (`tools/re/palette.py`) |
| Textos localizados | `src/game/locale/` | 8 idiomas, chave = texto em inglês |
| Telas ligadas ao jogo | `src/game/screens/` | HUD ligado ao `GameStore`; popups de confirmação de conta e de acelerar procriação |
| Mapa isométrico | `src/game/world/` | chão (`night_islands` a 3,6×), céu, construções de `map.items` com a arte do APK, arrastar e zoom 0,3–1,5; notas em `docs/world.md` |
| Toque | `src/game/world/touchMask.ts`, `IsoWorld.hitTest` | máscaras `.mask` por pixel, pegada em tiles quando não há máscara, seleção da construção tocada |
| Menu da construção | `src/game/world/menu/` | botões `HUDButton` por tipo de construção; MOVE arrasta a construção (OK/CANCEL) e envia `move` ao servidor |
| Dragões | `src/game/world/skeleton/`, `DragonActor.ts` | esqueletos `.bin` + atlas do mapa; dragões andam pelos caminhos `Engine/*_right.bin` dos habitats |
| Texturas DXT | `src/game/atlas/dds.ts` | decodificador em CPU (o WebGL recusa alturas não múltiplas de 4) |
| Boot | `src/game/boot.ts` | tela do logo, depois a tela de carregamento (`SplashScreen.ccbi`) com a escolha de login e a barra de progresso, depois o HUD |

Para ver: `npm run dev` e abrir `http://localhost:5173/` (use `?fresh` para pedir o login de novo,
`?lang=pt_br` para trocar o idioma, `?ccb=CCB/MainMenu/HUD.ccbi` para ver um `.ccbi` isolado).
Testes: `npx tsx --test <arquivo>` (ccb, atlas, locale, screens, session, mock-server).

## Premissas do servidor de mentira (a conferir)

- `gold` está em `playerInfo`: o parser recuperado de `PlayerInfo::parsePlayerInfo` não lista chave para ouro.
- O estado privado (`goals`, `gifts`, `bonusNextId`…) vai na raiz de `user`; não foi confirmado.
- `config.levels` é um objeto indexado pelo nível, com `xp_required`/`xp_needed`; a curva de XP e o catálogo
  (`mock-server/catalog.ts`) são inventados, o catálogo real só existia no servidor.
- Só `level_up`, `complete_tutorial`, `win_daily_bonus` e `set_login_rewarded` mudam o estado; os outros comandos
  só são confirmados.

## Pendências conhecidas

- Facebook: o botão fica desabilitado; só existe o login sem Facebook.
- Contorno dos rótulos (largura estimada), gradiente de `CCLayerGradient`, recorte de `CCClippingNode`,
  `SPAnimatedSprite` (só o primeiro quadro) e o escurecimento atrás dos popups.
- Texturas: só as pastas `s3tc` (DXT) e PNG são lidas, ambas em qualquer GPU porque o DXT é decodificado na CPU; as pastas `etc1`, `atitc` e `pvr` não são usadas.
- O carregamento é lento no Vite de desenvolvimento (centenas de requisições, e o GL por software do Chrome sem GPU disputa a CPU): pode levar de 15 a mais de 40 segundos.
- O Vite deixou de notar arquivos alterados algumas vezes (módulos velhos, carregamentos presos): se algo parecer travar, reinicie `npm run dev`.
- Alguns atlases não vêm no APK de forma legível (`starter_package_assets` só em PVRTC, `PirateIsland_Assets` ausente).
- Nomes semânticos dos argumentos dos comandos e formato do `result` de cada um (ver `docs/protocol.md` §4 e §7).

## Próximos passos sugeridos

1. Ações dos outros botões do menu (INFO, UPGRADE, GROW FOOD, BREED, BUY EGG…) com seus popups, vender construções, ovos e os estágios 0, 2 e 3 dos dragões (faltam no APK; o carregador acha qualquer `NNNN_nome_<estágio>.zip` colocado em `HD/Engine/s3tc`).
2. Loja, expansões do terreno (`expansionsImages`) e mercado de dragões (`CCB/Store`, `CCB/DragonMarket`) ligados aos comandos `buy`, `sell`, `move`.
3. Criar/chocar ovos e procriação (`CCB/Breeding`) com `breed_dragon_2`, `finish_breeding_2`, `hatch_egg`.
4. Tutorial e metas (`CCB/Tutorial`, `config.goals`).
