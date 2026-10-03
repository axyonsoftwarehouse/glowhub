# Domínio — Beleza, barbearia e estética

Visão de negócio que orienta o GlowHub. Serve para modelar dados, telas e regras.

## 1. Segmentos atendidos
Salões de beleza, barbearias, estúdios unissex, clínicas de estética, spas,
nail/design de unhas, sobrancelhas/cílios e massagem — em geral negócios de
**agendamento com profissionais** e **venda de produtos**.

## 2. Entidades principais
| Entidade | Descrição |
|---|---|
| **Tenant (empresa)** | O cliente do SaaS. Isolamento de dados por tenant. |
| **Branch (filial)** | Unidade do tenant; tem horários, equipe, serviços e preços próprios. |
| **Usuário/Equipe** | Dono, gerente, recepção, profissional. Papéis por tenant. |
| **Cliente** | Consumidor final; histórico, carteira e fidelidade. |
| **Serviço** | O que é executado (corte, escova, limpeza de pele…), com duração e preço. |
| **Categoria/Subcategoria** | Organização do catálogo de serviços (e de produtos). |
| **Profissional** | Executa serviços; vínculo com filial(is) e comissões. |
| **Agendamento (booking)** | Reserva de serviço(s) + profissional + data/hora. |
| **Atendimento/Transação** | Execução + cobrança (serviços, produtos, pacotes). |
| **Pacote** | Pré-pago de serviços (ex.: "5 cortes"), com validade e resgate. |
| **Assinatura** | Plano recorrente (mensal/anual) com benefícios/limites. |
| **Cupom/Promoção** | Desconto percentual ou fixo, com validade e limite de uso. |
| **Produto** | Item de venda (variações, estoque, entrega). |
| **Pedido** | Compra de produtos (carrinho, frete, pagamento). |
| **Carteira** | Crédito pré-pago do cliente usado como pagamento. |
| **Comissão** | Remuneração do profissional por serviço/produto. |
| **Gorjeta** | Valor adicional destinado ao profissional. |

## 3. Rotinas do dia a dia
- **Cliente**: descobre serviço/loja → escolhe profissional e horário → paga →
  recebe lembretes → remarca/cancela → avalia → compra produtos.
- **Recepção/balcão**: opera a agenda, faz check-in/checkout, registra pagamento,
  adiciona produtos, aplica cupom/pacote, registra gorjeta.
- **Profissional**: vê sua agenda, atende, recebe comissão e avaliações.
- **Dono/gerente**: acompanha faturamento/ocupação, gerencia equipe, catálogo,
  preços, pacotes, promoções, repasses e relatórios.

## 4. Estados de agendamento (referência)
`pending → confirmed → check_in → checkout → completed` (com `cancelled`).

## 5. Regras de negócio comuns
- **Preço e duração podem variar por filial** (não só por serviço).
- **Slots** derivam do horário de funcionamento (+ intervalos), feriados e
  agendamentos existentes do profissional.
- **Pacote/assinatura** cobrem total ou parcialmente um atendimento.
- **Duplicidade**: evitar dois agendamentos ativos iguais (cliente/filial/horário).
- **Bloqueios**: férias, folgas, feriados e dias fechados.
- **No-show/cancelamento**: políticas e taxas (definir por tenant).

## 6. Dinheiro — o que precisa ser confiável
Fontes de receita: **serviços**, **produtos**, **pacotes**, **assinaturas**,
além de **gorjeta** (não é receita da casa) e **carteira** (pré-pago). Formas de
pagamento: dinheiro, cartão, online (gateway) e carteira.

Conceitos que o financeiro do GlowHub deve respeitar:
- **Partidas dobradas** (débito = crédito) e **livro imutável** (append-only).
- **Valores em inteiro (centavos)** para evitar erro de arredondamento.
- **Idempotência** em pagamentos/webhooks (nunca creditar duas vezes).
- **Conciliação** entre o que foi cobrado e o que foi recebido.
- **Estorno/cancelamento** como lançamento reverso (não apagar histórico).
- **Trilha de auditoria** de quem fez o quê e quando.
- **Repasses** (comissões/gorjetas) e **saques** com estado (pendente/pago).
