# [p] Potato Downloader

Um downloader pessoal inspirado no [cobalt.tools](https://cobalt.tools), com uma interface de terminal em ASCII, preto e verde. Projeto independente; nao e um fork nem uma instancia oficial do Cobalt.

```text
       .-----------.
    .-'   .     o   '-.
   /   o       .      \
  |    .    o      .   |   POTATO
  |  o    .    o      |    DOWNLOADER_
   \      .       o  /
    '._    o    __.-'
       '-------'
```

## Iniciar com Docker (interface + motor de download)

Instale Docker com Compose e rode na raiz do projeto:

```sh
docker compose up -d --build
```

Abra **http://localhost:3000**. A API Cobalt atende em **http://localhost:9000**. Essas portas ficam vinculadas apenas ao computador local. A imagem do motor vem do projeto [imputnet/cobalt](https://github.com/imputnet/cobalt), versao principal 10.

O Compose baixa e executa o motor Cobalt separadamente; este repositorio contem a interface e o servidor Potato. Os arquivos e licencas do motor permanecem no projeto original. Nao sao incluidos cookies, tokens ou credenciais.

## Iniciar com Node

Requer Node.js 22.9+ (recomendado: Node 24). Sem dependencias npm para instalar.

1. Copie `.env.example` para `.env`.
2. Configure `COBALT_API_URL` com uma instancia Cobalt que voce hospeda ou tem permissao para usar.
3. Se a instancia exige chave, defina `COBALT_API_KEY` no `.env`.
4. Execute `npm start` e abra http://127.0.0.1:3000.

```sh
npm start
```

Sem a instancia Cobalt, a interface continua disponivel e informa **API desconectada**; downloads reais exigem o motor. A API publica de `cobalt.tools` tem protecao contra bots e [nao deve ser usada por outros projetos sem permissao](https://github.com/imputnet/cobalt/blob/main/docs/api.md).

## Funcionalidades

- Interface responsiva ASCII, navegavel por teclado e com suporte a movimento reduzido.
- Video com audio, somente audio ou video mudo.
- Qualidade de video e formato de audio (MP3, OGG, WAV, Opus ou melhor disponivel).
- Selecao individual em posts com varias midias, incluindo audio de slideshows.
- Retornos de erro reais, cancelamento do pedido e verificacao da API.
- Preferencias locais. Sem analytics ou historico persistente de links.
- Chave da API apenas no servidor. Limite de pedidos e validacao de entrada.

O fluxo gera links de download e mostra botoes para salvar. Dependendo dos cabecalhos da origem, o navegador pode abrir o arquivo em uma nova aba em vez de salva-lo automaticamente. A qualidade e um pedido ao motor: o formato final e a disponibilidade dependem da origem, dos recursos da instancia e das restricoes da plataforma. Conteudo privado, DRM e remux local no navegador nao sao suportados.

## Arquitetura

```text
navegador -> servidor Potato /api/download -> instancia Cobalt
         <- links prontos ou lista de midias <-
navegador -> link da midia/tunel Cobalt -> arquivo
```

O servidor encaminha o link ao Cobalt configurado. O arquivo e servido pela origem ou pelo tunel Cobalt; o Potato nao armazena o arquivo. Preferencias ficam no localStorage; URLs ficam apenas na memoria da pagina durante a sessao. O provedor da midia, a instancia Cobalt e o provedor de hospedagem podem ter seus proprios registros.

## Hospedar

Use uma hospedagem com Node ou Docker. O **GitHub guarda o codigo**; GitHub Pages sozinho nao executa o servidor nem o Cobalt. Para expor publicamente, configure HTTPS, a URL publica do tunel em `API_URL` no servico Cobalt e protecao da instancia conforme a [documentacao oficial](https://github.com/imputnet/cobalt/blob/main/docs/protect-an-instance.md). O limite do Potato e por IP de conexao, em memoria; multiplas replicas e proxies exigem uma politica de limite na borda. Nunca envie `.env` ou chaves ao repositorio.

## Verificacao

```sh
npm run check
npm test
```

Os testes usam um upstream simulado para validar contrato, erros, parametros, seguranca e limites. Isso nao garante disponibilidade de uma plataforma externa. Para testar de ponta a ponta, inicie o Compose, confirme `API conectada` e use o link de uma midia sua.

## Creditos

Interface e servidor Potato: MIT. Motor de download: [Cobalt](https://github.com/imputnet/cobalt), distribuido separadamente sob sua propria licenca. Baixe apenas conteudo que voce criou ou tem permissao para salvar.
