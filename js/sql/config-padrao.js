/* Configuração padrão das regras (categorias, prazos, centros) e colunas do acompanhamento.
   Os dados da empresa (lista "Fora do escopo" com CNPJs e as raízes da própria empresa) NÃO ficam no código:
   vêm do arquivo de configuração da empresa, importado em Configurações e guardado no navegador
   (o original fica em followup-nf/config/configuracao-empresa.json, que nunca vai para o GitHub). */

export const CONFIG_PADRAO = {
  escopo: [],                   // lista "Fora do escopo": vem do arquivo de configuração da empresa
  raizesProprias: [],           // raízes do CNPJ da própria empresa (nunca saem pela raiz, só pelo CNPJ completo): idem
  diasMista: 30,                // transportadora mista: sem digitalização depois disso = fora do escopo (sugerido)
  diasVencimento: 30,           // vencimento estimado = emissão + 30 dias (decidido em 14/11)
  corteBacklog: '2026-01-01',   // pendências emitidas antes vão para o backlog arquivado
  diasTransportadoraNova: 45,   // primeiro CT-e de uma transportadora nesses dias = aviso
  transportadorasConhecidas: [],// raízes marcadas como "do almoxarifado" (sem aviso de nova)
  centros: ['3001'],
  movimentos: ['101', '102', '122', '123', '161'],
  categorias: [
    { cat: '', rotulo: 'Estoque', grupo: 'Estoque' },
    { cat: 'K', rotulo: 'Débito direto (centro de custo)', grupo: 'Débito direto' },
    { cat: 'F', rotulo: 'Débito direto (ordem)', grupo: 'Débito direto' },
    { cat: 'A', rotulo: 'Imobilizado', grupo: '' },
    { cat: 'P', rotulo: 'Projeto', grupo: '' },
    { cat: 'U', rotulo: 'Desconhecida (serviço)', grupo: '' }
  ]
};

export const ACOMP_COLS = ['chave', 'escopo_manual', 'vencimento_manual', 'proxima_acao_data', 'proxima_acao_texto', 'canal_recebimento', 'tipo_operacao_manual', 'projeto', 'arquivada_manual', 'atualizado_em'];
export const CONTATO_COLS = ['id', 'chave', 'data', 'quem', 'texto', 'registrado_em'];
