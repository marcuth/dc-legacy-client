# Dragon City 2.0 (Android, 11-05-2013) — protocolo cliente/servidor

Fonte: análise estática de `lib/armeabi-v7a/libdc.so` (ELF32 ARM, Thumb-2, **não stripped**: 39 mil
símbolos C++ exportados). Engine: Cocos2d-x + framework interno **hydra** (Social Point).
Nada aqui foi observado em execução; tudo é leitura de código. Itens marcados **[?]** são
inferências ou não foram confirmados.

Endereços são vaddr do `.so`. Ferramentas para reproduzir: `tools/re/`. Dumps: `docs/re-output/`.

---

## 1. Hosts e URLs

| O quê | Valor | Onde |
|---|---|---|
| Base do servidor de jogo (`BaseServer`) | `http://dca.socialpointgames.com/` | `ServiceLocator::loadAppServices` @0x597bd2 (`setBaseServerUrl`) |
| Assets estáticos / `STATIC_URL` | `http://dynamicdc.socialpointgames.com/dragoncity/web` | rodata 0x8a7066 (também vem do servidor: chave `STATIC_URL`) |
| crossdomain | `http://dynamicdc.socialpointgames.com/crossdomain.xml` | rodata 0x8a47b2 |
| Foto de perfil FB | `https://graph.facebook.com/<id>/picture?type=square&width=150&height=150` | rodata |

`BaseServer::getServerUrl(path)` = base + path. A base pode ser sobrescrita em runtime, então
o servidor reconstruído só precisa responder nesses paths.

### Endpoints (paths no `BaseServer`)

| Path | Método | Função cliente | Uso |
|---|---|---|---|
| `/game/config/prelogin_config` | POST (m=1) | `SocialPointScreenController::checkSplashScreen` | param `platform=android`; config antes do login |
| `/mobile/aio/login` | POST **[?]** | `SPSocialConnection::loginWithFacebook` / `loginWithoutFacebook` | login, ver §3 |
| `/packet/execution` | POST (m=1) | `CommandQueue::processCommandQueueWithUserId` @0x428d34 | **canal principal**: fila de comandos, ver §4 |
| `/player/info` | POST (m=1) | `PlayerInfoRetrieve::getPlayerInfo` | recarrega estado do jogador |
| `/mobile/notifications` | ? | `NotificationController::setEnabled` | push |
| `/mobile/tutorial` | ? | `TutorialManager::refreshServerTutorialProgress` | |
| `/mobile/crash` | ? | `CrashReporter::sendCrashReport` | pode devolver 200 vazio |
| `/pvp/isle` | ? | `CombatWorldManager::requestDragonLevel` | |
| `/users/…`, `/merge/…` | ? | `AccountMerger` | merge de conta FB (m=1 POST) |
| `/requests` | ? | `MessageCenterManager`, `SPSocialConnection::sendRequest` | mensagens/presentes; params `sessionId`, `idList[]`, `data[…]` |
| `/mobile/engine/version_1_1/{dragons,assets,attacks,…}_{etc1,atitc,s3tc}/` | GET | `LegacyAssetsManager` | assets por formato de textura |
| `/mobile/engine/{masks,paths}/`, `/mobile/ui/`, `/assets/thumbs/` | GET | | |

Assets de imagem existem em 4 variantes de compressão: `_etc1`, `_atitc`, `_s3tc`, `_png`.
Para HTML5 só `_png` interessa.

---

## 2. Camada HTTP e assinatura

Cliente HTTP = `CurlHttpClient` → `SetupHttpClient` → `DCValidateHttpClient` (subclasse de
`hydra::ValidateHttpClient`), criados em `ServiceLocator::loadAppServices` @0x597ae4.

* Toda requisição leva o header **`X-Accept: sp-sign`** (`ValidateHttpClient::fixRequest` @0x5ff00c).
* O servidor deve responder com o header **`x-sp-sign`** =
  `hex_lowercase( HMAC_SHA256( key, body_da_resposta ) )` (64 chars).
  * `sign()` @0x5fead0 chama `hmac_sha256(key, key_len, data, data_len, out, 32)` e formata cada
    byte com `setw(2)`+`setfill('0')`+hex.
  * `validateResponse()` @0x5febd0: se o header faltar → `"Validation error: no signature header"`;
    se não bater → `"Validation error: wrong signature"`; em ambos o código vira **471 (0x1d7)**.
    `DCValidateHttpClient::sendSync` @0x5d533c trata 471 mostrando
    `"Mac key received is different than expected"` / `"Incorrect Mac Key"`.
  * Variante "assinatura no corpo" (primeiros 64 chars do corpo + 1 separador) existe no código mas
    o DC cria o cliente com o flag desligado (`DCValidateHttpClient` ctor passa `false`) → **usa header**.
* **Chave HMAC: `RGhXbiy4xEeDnSNX1oBG`** (string em rodata 0x8a4b87, carregada em `loadAppServices`
  @0x597b48 e passada ao `DCValidateHttpClient`). Mesma chave para tudo.
* `fixRequest` também sabe assinar *parâmetros de request* (`"<hmac>;<valor>"`, via
  `setSignedParameter`), mas nenhum chamador foi encontrado no DC → **[?]** provavelmente não usado.
* `Accept-Encoding: gzip` é enviado (rodata 0x8a4afb/0x8a4b0b); o servidor pode comprimir.

Implicação para o servidor: **toda resposta (incl. `/game/config/*`, login, `/player/info`) precisa de
`x-sp-sign`**, senão o cliente original rejeita. Se o cliente novo for seu (HTML5), isso é opcional,
mas vale manter por compatibilidade.

---

## 3. Login e resposta

`/mobile/aio/login` — parâmetros (nomes literais em `SPSocialConnection::loginWith*`):

Sem Facebook (`loginWithoutFacebook` @0x59e8dc):
`logintype=not-fb`, `mobileenv=android`, `mobileuser`, `language`, `mobileBundleVersion`,
`os`, `device`, `deviceUid` (vem de `NativeUtils.getDeviceUid()` via JNI).

Com Facebook (`loginWithFacebook` @0x59e336): igual, mas `logintype=fb` e mais
`mobiletoken`, `mobilefacebooktoken` e `neighbors` (lista de amigos FB). `security_token`/`token`
aparecem na leitura do retorno.

Resposta: JSON (corpo começando com `{`/`[`), **objeto plano** cujas chaves
`SPSocialConnection::jsonSucceed` @0x59da00 percorre:

| Chave | Efeito |
|---|---|
| `sp` | id do usuário (`m_userId`) |
| `session_id` | `m_sessionId` (também vai pro crash reporter) |
| `user` | `ModelManager::setPlayerInfoNode` — estado do jogador (§5) |
| `config` | `ModelManager::setGameConfigNode` — catálogo do jogo (§6) |
| `mobile_user_tp` | `setThirdPartyUserId` |

Erros: a resposta pode trazer `error`; o cliente mostra `"SP server error response: "`.

---

## 4. Fila de comandos — `POST /packet/execution`

`CommandQueue::processCommandQueueWithUserId` @0x428b08. Cada ação do jogador vira um `Command` na
fila (`CommandManager::sendCommand`), serializada em lote:

**Query/form params**

| Param | Valor |
|---|---|
| `USERID` | user id (`sp` do login) |
| `user_key` | **[?]** chave do usuário; provável `session_id` (strings `user_key`/`session_id` adjacentes) |
| `platform` | `android` |
| `data` | JSON abaixo |

**`data`** (montado por concatenação de strings):
```json
{"first_number":<n do 1º comando>,"ts":<getTime()>,"commands":[ <cmd>, <cmd>, ... ]}
```
**Cada comando** (`Command::toJSON` @0x41dbf4):
```json
{"cmd":"<id>","number":"<n>","time":"<t>","args":[ ... ]}
```
Atenção: `number` e `time` são serializados **com aspas** (strings). `args` é **array posicional**
(`hydra::AttrList::addChild`), não objeto — a ordem importa. `number` é um contador sequencial por
sessão (`CommandManager::resetCommandNumberCount`).

**Resposta** (`CommandQueue::validateResponse/validateCommands`):
```json
{"result": <ok?>, "response": [ {...}, {...} ]}
```
`response` tem um item por comando enviado, na ordem. Um item com chave `error` faz o cliente
mostrar `"Command error: <cmdId> <number>"` + `"Please restart the game"`. Falha de HTTP →
`"SERVER ERROR"`; JSON/validação inválidos → `"VALIDATION ERROR"`.
Respostas por comando (`validateResponse` de cada classe) leem sobretudo `result` e `cmd`
(ver §4.2).

Comandos "urgentes" (`isUrgent`) forçam envio imediato; senão a fila é enviada em lote por timer
(`setOperationQueueTime`) e persistida em disco (`savePendingCommands`).

### 4.1 Tabela de comandos (cmd id → args posicionais)

Derivado da ordem das chamadas `AttrList::addChild` nos construtores (`docs/re-output/command-ctors.txt`).
Os nomes dos argumentos são **meus**, deduzidos dos tipos/nomes das classes — a *ordem* é o dado
firme; a semântica [?] deve ser conferida contra tráfego real/uso no código.

| cmd | Classe::ctor(params) | args |
|---|---|---|
| `buy` | CommandBuy(int,int,int,int[,uint]) | [itemId, x, y, ?] (variante com 5º: `[1,0,0,p5]` **[?]**) |
| `buy_egg` | CommandBuyEgg(uint,uint,uint,bool[,uint]) | [p1, p2, …] |
| `buy_treasure_new` | CommandBuyTreasureNew(int[,uint]) | [id(, p2)] |
| `expand_island` | CommandBuyIsland(uint,uint,uint) | [p1, p2] |
| `expand_cash` / `expand_gold` | CommandExpand(uint,uint,int) | [p1] (cmd depende da moeda) |
| `buy_si_help` | CommandBuySiHelp(int) | [id] |
| `BuyArbitraryPromotion` | (int) | [id] |
| `sell` | CommandSell(int) | [id] |
| `sell_dragon` / `sell_egg` | (int,uint) | [id] |
| `sell_stored_dragon` | (int,uint,uint,bool) | [p1, p2, 1] |
| `sell_stored_item` | (int,uint,bool) | [p1, 1] |
| `store_item` | (uint) | [id] |
| `place_stored_dragon` | (int,int,string,int,int,bool) | [p1, p2, name, p4, p5, 1] |
| `place_stored_egg` | (int,int,bool) | [p1, p2, 1] |
| `place_stored_item` | (int×8,bool) | [p1…p8, flag] |
| `move` | (int,uint,uint,uint) | [id, x, y, flip] |
| `move_dragon` | (uint,uint) | [p1, p2] |
| `collect` | (int[,int]) | [p1(, p2)] |
| `speed_collect` | (int) | [id] |
| `upgrade` | (int) | [id] |
| `finish_building` | (uint,uint,uint) | [p1] |
| `activate` | (int,int) | [p1, p2] |
| `level_up` | (uint) | [level] |
| `breed_dragon_2` | (int,int,int,bool) | [p1, p2, p3, p4] |
| `finish_breeding_2` | (int,int,int) | [p1, p2, p3] |
| `speed_breeding` | (int) | [id] (resposta usa cmd `finish_breeding_2`) |
| `hatch_egg` | (uint,uint,uint,string,uint) | [p1, p2, p3, name] |
| `speed_hatch` | (int,uint) | [id] |
| `mistery_egg_hatch` | (int) | [id] |
| `feed_dragon` | (int) | [id] |
| `rename_dragon` | (uint,string) | [id, name] |
| `start_training` | (int,uint,uint,uint) | [p1, p2, p3, p4] |
| `finish_training` | (int) | [id] |
| `speed_training` | (int) | [id] |
| `attack_player` | (string,uint,vector<Dragon*>,CombatInfo*) | **[?]** (array montado a mão; resposta `result`) |
| `end_attack` | (string,int,bool,Combat*) | [oppId, p2, p3, …] |
| `begin_tournament` / `end_tournament` | () / (bool,Combat*) | [] / [won, …] |
| `set_attack_team` | (string,CombatWorldTeam*) | [teamName, [d1,d2,…]] |
| `set_goals` | (int,int,int) | [goalId, [..]] **[?]** |
| `complete_goal` | (int) | [id] |
| `complete_tutorial` | (int) | [step] |
| `complete_collection` | (int) | [id] |
| `set_login_rewarded` | () | [2] |
| `set_resource_allies` | (int,string) | [fbId, p1] |
| `assist_neighbor` | (string,string) | [neighborId, p2] |
| `clean_received_assists` | (string) | [id] |
| `win_daily_bonus` | (int) | [id] |
| `hidden_reward_claim` | () | [] (resposta lê `result`, `id`, `em`) |
| `collect_game_add_item` | (uint,int) | [id, "cash"?] |
| `collect_game_buy_all` / `_speedup` / `_update_timestamp` | | ver ctor-dump |
| `finish_si` | (int[,int]) | [p1(, p2)] |
| `app_crash` | () | [<texto>] |
| `admin_*` (reset, fast_forward, add_resources, create_dragon, reset_goals, del_pvp_player, collect_game_reset) | | debug/admin |

Os `admin_*` existem no binário de produção; o servidor reconstruído pode ignorá-los.

### 4.2 Respostas por comando

Quase todos usam só o `validateResponse` genérico de `Command::validateResponseId` (confere que
o item de resposta carrega o mesmo `cmd`/`number`). Específicos:
* `breed_dragon_2`, `finish_breeding_2`, `attack_player`, `mistery_egg_hatch`, `hidden_reward_claim`:
  leem `result` (estrutura própria — **[?]** precisa de leitura aprofundada).
* `CommandResources::validateResponseGold/Cash/Resources`: comandos de compra devolvem recursos
  autoritativos do servidor (gold/cash/food…) para o cliente se reconciliar.

---

## 5. Estado do jogador (`user` do login e `/player/info`)

`ModelManager::parseJSON(AttrDictionary*, JSONNodeFileType)` consome (chaves lidas, em ordem):
`timestamp`, `playerInfo`, `map`, e o estado privado. Esquemas (chaves lidas em cada `parse*`;
tipos **[?]** — só os nomes foram extraídos até aqui):

* **playerInfo** (`PlayerInfo::parsePlayerInfo`): `pid`, `cash`, `food`, `xp`, `level`,
  `completed_tutorial`, `pvpLevel`, `tsReg`. (gold provavelmente em `resources` / chave curta **[?]**)
* **map** (`UserMap::parseMap`): `items`, `eggs`, `islandNumber`, `work`, `resourceAlliesMarket`,
  `ownedDragons`, `store`, `universAttackWin`, `receivedAssists`.
  * dragões (`parseDragonsMap`): `habitatId`, `name`, `work_id`, `xp`, `nbKill`, `attack`
    (+ `iid`, `lvl` nas listas de presente).
  * ovos (`parseEggsMap`): `id`, `ts`.
* **private state** (`PrivateState::parsePrivateState`): `bonusNextId`, `id`,
  `timestampLastBonus`, `timestampLastAllianceBonus`, `timestampLastTrade`, `numTradesDone`,
  `resourcesTraded`, `timestampLastChapter`, `idCurrentMission`, `currentTournament`,
  `beginTournamentTs`, `endTournamentTs`, `attacksSent`, `teams`, `goals`, `completedGoals`,
  `gifts`, `mobileFbLoginRewarded`, `neighborAssists`, `collectGame`, `completedCollection`,
  `starterPackageOwned`, `activeHiddenReward`.
* **vizinho** (`FriendPlayerInfo::parseJSON`): `resources`, `full_name`, `data`, `dragons`, `iid`.
  Dados de PvP: `PVPIslandInfo`, `CombatWorldPlayerDragon` (versão com chaves curtas).

## 6. Config do jogo (`config` do login)

Chaves de nível superior (`ModelManager::parseJSON`): `items`, `levels`, `sounds`,
`expansion_prices`, `tournaments`, `attacks`, `opposite_elements`, `breed_oposite`, `goals`,
`treasure_items`, `iphone_config`, `android_store_packs`, `android_promotions`, `iphone_tutorial`,
`iphone_non_blocking_tutorial`, `resource_gifts`, `requests`, `collect_game*`
(`_items`, `_quests`, `_probabilities`, `_item_containers`, `_i18n`), `collections`, `expansions`,
`starter_package`, `dragon_feed_costs`, `payment_products_offers`, `google_play`, `hidden_reward`,
`STATIC_URL`, `LIMITS`, `ISLANDS_COSTS`.

Chaves por seção estão em `docs/re-output/config-keys.txt` (ex.: `Level`: `name`, `reward`,
`xp_needed`; `Attack`: `id`,`type`,`canvas_damage`,`effect_*`,`training_time`; `Collection`:
`id`,`dragon_ids`,`reward`; `Tutorial`, `Goal` etc.). O conteúdo (os itens/dragões em si) **não está no
`.so`**: é entregue pelo servidor — e não existe em `assets/` do APK (ver §8).

---

## 7. O que ainda não foi levantado

1. Formato de cada `result` por comando e os campos de `items`, `dragons` (`gameItem` tem
   `properties`, `activation`, `capacity`, `incubator`, `max_dragon_level`, …) — precisa ler
   `GameItem::{ctor}(AttrDictionary)` e `PlayerInfo` mais a fundo.
2. Tipos (int/string/float) e obrigatoriedade das chaves de §5/§6.
3. Método HTTP exato e parâmetros de `/mobile/*`, `/requests`, `/pvp/isle`, `/users`.
4. Semântica real de `user_key` e a derivação de `neighbors`.
5. Mensagens de combate (`CombatWorld*`, `/pvp/isle`) e mercado/dragon book.
6. `classes.dex` (Java) — contém o fluxo de Facebook/IAP (billing) e `NativeUtils`.

## 8. Próximos passos recomendados

* `assets/` do APK (1737 arquivos, 92 MB: `CCB`, `Engine`, `Fonts`, `HD`, `SD`, `Locale`, `Shaders`,
  `Sounds`) **não** contém o JSON de config/login: `local_json.txt` (lido por
  `SPSocialConnection::readLocalJSON`) é um cache gravado em runtime. O catálogo (itens, dragões,
  níveis) vem só do servidor, então precisa ser reconstruído (ex.: de wikis/dumps antigos) e
  validado contra os parsers de §6. Os `Locale/locale_*.txt` dão nomes/textos de itens e dragões.
* Decompilar `classes.dex` (jadx) para o resto do cliente nativo.
* Escolher entre (a) servidor compatível com o cliente original (precisa de HMAC, §2) ou (b) servidor
  + cliente HTML5 próprios, onde só os formatos de §3–§6 importam.
