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
* Os `.mask` (`Engine/NNNN_nome.mask`) são a máscara de toque de cada construção (seção abaixo); os `*_right.bin` são os caminhos dos dragões.
* Dragões são esqueletos animados: veja a seção abaixo.

## Texturas

Os `.dds` são DXT1/3/5. Alguns têm altura que não é múltipla de 4 (habitat 436 × 334), que o WebGL recusa; por isso
`src/game/atlas/dds.ts` decodifica o primeiro nível em RGBA na CPU (conferido contra o Pillow).

## Dragões e esqueletos (`cocos2d::extension::skeleton`)

Os arquivos `.bin` de animação (`CCBinaryAnimParser::parseFile` @0x62115c) têm este formato (little endian; uma string é
um `int16` de tamanho seguido de caracteres UTF-16):

    animação* := string nome, string atlas, int32 comprimento, int32 nPartes, parte*nPartes
    parte     := string nome, int32 camada, int32 frames, quadro* (até as repetições somarem `frames`)
    quadro    := int32 início, int32 repetições, float alpha, anchorX, anchorY, x, y, scaleX, scaleY, rotationX, rotationY

* A ordem dos campos do quadro vem de `CCFrameInfo::{ctor}` @0x61f940 e dos getters; posições em pontos com y para cima,
  rotações em graus, âncoras normalizadas. Alpha ≤ 0 esconde a parte (`CCPartSprite::applyFrameInfo` @0x61c97c).
* Todos os `.bin` do APK (31 caminhos e as animações dos dragões) são lidos até o último byte (`anim.test.ts`).
* Um dragão é `NNNN_nome_<estágio>.zip`: atlas das partes para o mapa (`*_map.xml/.dds`) e as animações `walk`, `breathe`,
  `levelup`, `special1`, `special2`. O APK só traz o estágio 1 do dragão de terra (1011).
* A transformação de cada parte é a de `CCNode::nodeToParentTransform` com rotações separadas em x e y, convertida para y para baixo.
* `Engine/NNNN_nome_right.bin` é o **caminho** que os dragões percorrem dentro da construção (`CCAnimPathParser` usa o mesmo
  formato: cada parte é um caminho e cada quadro um ponto). As coordenadas são medidas a partir do canto superior esquerdo
  da imagem da construção, y para cima; o caminho do habitat de terra é um oval no centro do losango, com 143 pontos.
* A velocidade é 30 quadros por segundo **[?]**: `CCBaseSkeleton::update` avança um quadro por chamada (o atraso padrão é 0) e o
  intervalo de animação é definido pelo lado Java.
* O dragão se vira para o lado em que anda; a camada maior é desenhada na frente **[?]**.

## Toque por máscara (`TouchMask`, `GraphicScene::performMaskBasedTouchDetection`)

* Um `.mask` tem um byte por pixel, linha a linha de cima para baixo, `1` onde se pode tocar e `0` nas áreas transparentes.
  O tamanho **não** está no arquivo (`TouchMaskManager::createTouchMask(nome, largura, altura, …)` recebe de quem chama):
  é a imagem HD da construção a meio tamanho, em pontos (habitat 216 × 165, incubadora 324 × 276, fazenda 162 × 132, uma linha
  a menos que a imagem). O alinhamento é pelo canto superior esquerdo; a silhueta bate com a transparência da arte em cerca de 95 %
  dos pixels (a diferença são as bordas suaves).
* Sem máscara (arte ausente), o original usa `performTileBasedTouchDetection`: vale a pegada da construção em tiles.
* O cliente novo testa, da frente para trás: dragões (pelos limites do esqueleto), construções (máscara ou tiles) e, por fim, o chão.
  Um toque numa área transparente de uma construção passa para o que está atrás dela. `?masks` pinta as máscaras de vermelho.
