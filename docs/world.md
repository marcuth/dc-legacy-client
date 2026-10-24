# Mapa isométrico — o que o `libdc.so` e o APK dizem

Tudo aqui foi lido do binário (`tools/re/rdis.py`) ou conferido contra o APK. Itens com **[?]** são inferências.

## Projeção (`hydra::GraphicScene`)

`LoadState::createGraphicScene` @0x4686dc chama `GraphicScene::init(27.0, 13.5, 0.3, 1.5, -2000, 3625, 50, -3625, …)`:

| Valor | Uso |
|---|---|
| `27.0`, `13.5` | meia largura e meia altura do tile: um tile é um losango de 54 × 27 pontos |
| `0.3`, `1.5` | zoom mínimo e máximo |
| `-2000, 3625, 50, -3625` | limites de rolagem **[?]** (não aplicados no cliente novo) |

* `tileToPixel(tx, ty)` @0x600c48 = `(27·(tx − ty), −13.5·(tx + ty))` com y para cima (cocos). No cliente novo y vai para baixo.
* `pixelToTile` @0x60088e usa `ceil`: o tile `n` cobre o intervalo contínuo `(n − 1, n]`. Logo `tileToPixel(n)` é o canto
  **de baixo** do tile `n`, e um nó em `(x, y)` com largura `w` e altura `h` cobre os tiles `x−w+1 … x` e `y−h+1 … y`,
  com os pés em `tileToPixel(x, y)`.
* `IsoNode::setWorld` posiciona o sprite em `tileToPixel(x, y)`; a profundidade (`Map::calculateNodeZIndex` @0x602c08) é
  `trunc(worldX + worldY − width)`.
* Camada do mapa: escala inicial `0.6`, posição `(900, 850)` (pontos, y para cima). Isso centra a tela inicial perto do
  tile `(22, 63)`.

## Chão e céu

* `MapLayer::init` @0x44859c monta o chão **sempre** com o atlas `night_islands` e o céu com `night_background`.
* `MapPartManager::placeMap` @0x446ad8: grade 11 × 11 de partes `all_islands_<coluna><linha>.png`, 128 pontos de distância,
  âncora no canto inferior esquerdo, `x = coluna·128`, `y = (8 − linha)·128`, sem mistura (`GL_ONE, GL_ZERO`).
* `MapPartManager::setScaleMap(3.6)`: o lote inteiro é ampliado 3,6 vezes e posto em `tileToPixel(96.9, 168.7)`.
* Só 58 das 121 partes têm imagem (o resto é um pixel transparente): é a ilha principal.

## Construções

* A arte vem de `HD/Engine/<etc1|atitc|pvr|s3tc>/NNNN_nome.zip` (NNNN = id do item) com um `.dds` e um `.plist` de um quadro.
  O APK traz só `0001_incubator`, `0016_farm_1`, `0026_habitat_earth_1` e os dragões `1011_dragon_earth_a_{0,1}`; o resto
  era baixado do servidor (`LegacyAssetsManager`). Sem arte, o jogo usa `Engine/defaultBuilding.png`.
* Tamanhos em tiles: a largura do sprite em pontos dividida por 54 (fazenda 3 × 3, habitat 4 × 4, incubadora 6 × 6) **[?]**;
  o valor real vem de `config.items`.
* Os `.mask` (`Engine/*.mask`) guardam a máscara de toque por pixel de cada construção; os `*_right.bin` ainda não foram lidos.
* Dragões são esqueletos animados (`.xml` de partes + `.bin` de animação): ainda não implementados.

## Texturas

Os `.dds` são DXT1/3/5. Alguns têm altura que não é múltipla de 4 (habitat 436 × 334), que o WebGL recusa; por isso
`src/game/atlas/dds.ts` decodifica o primeiro nível em RGBA na CPU (conferido contra o Pillow).
