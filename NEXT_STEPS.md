# Próximos passos — cliente web do Dragon City (era Facebook)

Estado em 2026-10-24. Resumo do que existe e do que preciso para continuar.

## O que já está feito

- `docs/protocol.md` — protocolo do cliente **mobile** (Android 2.0), extraído de `libdc.so`:
  hosts, assinatura HMAC (`x-sp-sign`), login, `/packet/execution`, tabela de comandos, chaves de `user` e `config`.
- `docs/re-output/` — dumps brutos (símbolos demanglados, strings de `.rodata`, ctors de comandos, chaves).
- `tools/re/` — scripts de disassembly (`rdis.py`, `xref.py`, `args.py`, `cmds.py`, `keys.py`).
  Rodar com `python -I tools/re/<script>.py`; precisa de `capstone`, `pyelftools`, `itanium_demangler`.
- `src/game/network/mobile/` — cliente TypeScript do protocolo mobile (assinatura, login, fila de comandos,
  ~45 comandos tipados). 6 testes passando (`npx tsx --test client.test.ts`), `tsc --strict` limpo.

## Decisão tomada

Base principal = **cliente Flash decompilado** (`Base_sec_2.2.5/scripts`, 1614 `.as`, nomes ofuscados com `§`).
APK = referência de protocolo/esquema de dados e fonte de assets (HD/SD, `Locale/`, `.ccbi`).
Motivo: o alvo é a versão Facebook (Flash), e só o Flash tem a lógica de jogo legível.

## O que eu preciso para continuar

### Do usuário
1. **Qual `.swf` gerou `Base_sec_2.2.5`** e a build/data dele. Preciso confirmar que é a mesma versão do
   servidor antigo que queremos emular.
2. **Se existe o `.swf` original** (não só os `.as`). Ele traz classes de assets (sprites/animações) que a
   pasta `assets/images` (712 arquivos) pode não cobrir. A pasta `sounds` e `binaryData` estão **vazias**.
3. **Captura de tráfego real do cliente Flash**, se houver (HAR, Fiddler, Charles, logs). É a melhor forma
   de validar o protocolo. Sem isso tudo é leitura estática.
4. **Dumps do servidor/catálogo**, se houver (JSON de itens, dragões, níveis, goals). O catálogo **não está
   no APK nem no `.so`**: vinha do servidor. Sem ele o jogo não tem conteúdo.
5. **Decisão**: servidor compatível com o cliente original (precisa de HMAC e todos os formatos) ou
   servidor + cliente HTML5 próprios (só importam os formatos que o nosso cliente usar).
6. Preferências do projeto: o `package.json`/`tsconfig` raiz não existem aqui (só `src/` e `GamePlayer.tsx`).
   Dizer onde fica o app real (React + Vite?) para eu plugar o módulo de rede e o renderer.

### Trabalho meu, em ordem
1. **Protocolo do Flash**: achar no `.as` como ele fala com o servidor (URLs, `URLLoader`/`Socket`, JSON/AMF,
   chaves, comandos). Os nomes estão ofuscados, mas strings literais, chaves e estrutura sobrevivem;
   começar por `grep` de strings de rede e subir pelos chamadores. Já visto: usa `graph.facebook.com`;
   **não** achei `packet/execution` nem HMAC no Flash (o `x-sp-sign` é do mobile).
2. **Mapear os comandos do Flash** (`scripts/scripts/commands`, 48 arquivos) para a tabela de §4 do
   `docs/protocol.md`; reaproveitar o esquema de dados do mobile como referência de formato.
3. **Esquema de `user`/`config` com tipos**: parsers tipados para `playerInfo`, `map`, `items`, `levels`, etc.
   (hoje só tenho os nomes das chaves, sem tipos).
4. **Servidor mínimo** (login, `/packet/execution`, `/player/info`, com assinatura) para testar ponta a ponta.
5. **Portar a lógica do Flash** (`core/isoengine`, `battle`, `data`, `constants`) para TypeScript e
   renderizar com Pixi (`engine/GameEngine.ts` já existe).
6. **Assets**: imagens do Flash + APK; textos de `assets/Locale/locale_*.txt` (de, en, es, fr, it, pl, pt_br, tr).

## Pendências de confirmação no protocolo mobile (marcadas [?] no doc)

- Nomes semânticos dos argumentos dos comandos (ordem e quantidade são firmes).
- Método HTTP do login, `/requests`, `/pvp/isle`, `/users`, `/mobile/*`.
- Unidade de `ts`/`time` (assumi segundos) e valor de `user_key` (assumi `session_id`).
- Formato do `result` de cada comando; tipos dos campos de `user`/`config`.
- `classes.dex` ainda não analisado (Facebook, compras, `NativeUtils`).
