# inChurch → LUNOR | Fase 1 (somente leitura)

Documentação oficial: https://docs.inchurch.com.br/openapi.json

## Disponível nesta entrega

- Administração → Integrações · inChurch, visível apenas ao administrador da igreja.
- Testa credenciais Basic Auth em dois endpoints: `/public/v1/people/?limit=1` e `/public/v1/group/?limit=1`.
- Salva API Key e API Secret **cifradas** em tabela exclusiva por igreja, acessível só ao backend service_role.
- Consulta contagens de pessoas e grupos, sem apresentar ou persistir dados pessoais.
- Permite substituir credenciais e desconectar.
- Cliente de API read-only com paginação (limit/offset), timeout de 8 segundos e mensagens de erro sem conteúdo sensível.

## Configuração

1. Aplicar migration `20261106130000_inchurch_connections.sql` no Supabase.
2. Garantir secrets server-only: `SUPABASE_SERVICE_ROLE_KEY` e `INTEGRATIONS_ENCRYPTION_KEY` (32 bytes em Base64/Base64URL). **Não trocar** a chave de criptografia sem procedimento de migração de dados.
3. No painel inChurch em https://admin.inchurch.com.br/api/clientes, criar cliente **Local**, com escopos `people:GET` e `group:GET`. Evitar clientes sem escopos (podem ter acesso amplo).
4. Abrir Administração da igreja no LUNOR e preencher API Key + API Secret. O botão valida na API antes de persistir.
5. Confirmar contagens e testar desconexão.

Nenhum secret deve ser incluído em logs, tickets, GitHub, screenshots ou variáveis `NEXT_PUBLIC_*`.

## Fora do escopo da fase 1

- Importação/matching de perfis, vínculos e campus.
- Sincronização agendada e webhooks.
- SSO, atualizações ou exclusões na inChurch.
- Exportação de dados sensíveis, Kids ou financeiro.

Para começar a sincronizar, implementar mapeamentos de IDs externos por igreja, uma etapa de pré-visualização/deduplicação com confirmação humana, logs de sincronização e política de conflito. O módulo Groups não dispara webhooks.

## Testes

`npx vitest run src/lib/integrations/inchurch-client.test.ts`

Os testes usam fetch simulado, sem acesso real à inChurch. A conexão real depende de credenciais geradas pelo administrador. A migration e a implantação não são executadas automaticamente por este PR.
