import Link from "next/link";
import { LEGAL_COMPANY as C, LEGAL_VERSIONS } from "@/lib/legal";
import { LegalPage } from "../legal-layout";

export const metadata = { title: "Política de Privacidade · GlowHub" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade" version={LEGAL_VERSIONS.privacy}>
      <p>
        Esta Política explica como o GlowHub, oferecido por {C.name} (CNPJ{" "}
        {C.cnpj}), trata dados pessoais, em conformidade com a Lei Geral de
        Proteção de Dados (Lei 13.709/2018 &ndash; LGPD). Ela complementa os{" "}
        <Link href="/termos" className="text-brand underline">
          Termos de Uso
        </Link>
        .
      </p>

      <h2>1. Quem decide sobre os seus dados</h2>
      <ul>
        <li>
          <strong>Usuários do painel</strong> (donos, gerentes, equipe): o GlowHub
          é o <strong>controlador</strong> dos dados da sua conta.
        </li>
        <li>
          <strong>Clientes finais</strong> de um salão, clínica ou estúdio: a
          controladora é a <strong>Empresa</strong> que você contratou ou com quem
          agendou. O GlowHub atua como <strong>operador</strong>, tratando seus
          dados em nome dela. Para exercer seus direitos, procure primeiro a
          Empresa; se preferir, fale conosco e encaminharemos o pedido.
        </li>
      </ul>

      <h2>2. Dados que tratamos</h2>
      <h3>Usuários do painel</h3>
      <ul>
        <li>Nome, e-mail, senha (guardada apenas de forma criptografada), foto e preferências.</li>
        <li>Empresas, filiais e papéis aos quais você está vinculado.</li>
        <li>
          Registros de acesso: endereço IP, data e hora, navegador e dispositivo,
          incluindo o registro de quando você aceitou estes documentos.
        </li>
      </ul>
      <h3>Clientes finais (inseridos pela Empresa ou pelo agendamento online)</h3>
      <ul>
        <li>Nome, telefone, e-mail e, se a Empresa registrar, data de aniversário e preferências.</li>
        <li>Agendamentos, serviços realizados, profissionais e histórico de atendimento.</li>
        <li>
          Cobranças, pagamentos, carteira, pacotes, assinaturas, pontos de
          fidelidade e vales-presente. Dados de cartão são digitados diretamente
          no provedor de pagamento e não são armazenados pelo GlowHub.
        </li>
      </ul>

      <h2>3. Para que usamos e com qual base legal</h2>
      <ul>
        <li>
          <strong>Prestar o serviço</strong> (contas, agenda, financeiro,
          lembretes de agendamento): execução de contrato (art. 7º, V).
        </li>
        <li>
          <strong>Segurança e prevenção a fraudes</strong> (registros de acesso,
          limite de tentativas de login): legítimo interesse (art. 7º, IX) e
          cumprimento de obrigação legal, como a guarda de registros de acesso
          prevista no Marco Civil da Internet (art. 7º, II).
        </li>
        <li>
          <strong>Obrigações fiscais e contábeis</strong>: cumprimento de
          obrigação legal (art. 7º, II).
        </li>
        <li>
          <strong>Campanhas de marketing</strong> enviadas pela Empresa:
          consentimento do cliente final (art. 7º, I), que pode ser retirado a
          qualquer momento.
        </li>
        <li>
          <strong>Melhoria do produto</strong> com métricas de uso agregadas:
          legítimo interesse (art. 7º, IX).
        </li>
      </ul>
      <p>Não vendemos dados pessoais.</p>

      <h2>4. Com quem compartilhamos</h2>
      <p>
        Usamos fornecedores (suboperadores) estritamente necessários para operar
        a plataforma, sob contrato e com obrigações de segurança:
      </p>
      <ul>
        <li>hospedagem e infraestrutura da aplicação (Vercel);</li>
        <li>banco de dados (Neon);</li>
        <li>envio de e-mails transacionais (Resend);</li>
        <li>processamento de pagamentos online (Mercado Pago), quando a Empresa usa esse recurso;</li>
        <li>notificações no aplicativo móvel (Expo).</li>
      </ul>
      <p>
        Também podemos compartilhar dados com autoridades quando houver
        obrigação legal ou ordem judicial.
      </p>

      <h2>5. Transferência internacional</h2>
      <p>
        Alguns desses fornecedores armazenam ou processam dados fora do Brasil,
        como nos Estados Unidos. Nesses casos adotamos as salvaguardas previstas
        no art. 33 da LGPD, como cláusulas contratuais de proteção de dados.
      </p>

      <h2>6. Por quanto tempo guardamos</h2>
      <ul>
        <li>Dados da conta: enquanto ela estiver ativa.</li>
        <li>
          Dados da Empresa e de seus clientes: enquanto durar o contrato e por até
          30 dias após o encerramento, para exportação; depois são excluídos ou
          anonimizados.
        </li>
        <li>Registros de acesso: no mínimo 6 meses, conforme o Marco Civil da Internet.</li>
        <li>
          Lançamentos financeiros e documentos fiscais: pelo prazo exigido pela
          legislação (em regra, 5 anos).
        </li>
      </ul>

      <h2>7. Seus direitos</h2>
      <p>Nos termos do art. 18 da LGPD, você pode pedir:</p>
      <ul>
        <li>confirmação de que tratamos seus dados e acesso a eles;</li>
        <li>correção de dados incompletos, inexatos ou desatualizados;</li>
        <li>anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
        <li>portabilidade dos dados;</li>
        <li>eliminação dos dados tratados com base no consentimento e revogação do consentimento;</li>
        <li>informação sobre com quem compartilhamos seus dados.</li>
      </ul>
      <p>
        Envie o pedido ao encarregado (item 10). Respondemos em até 15 dias. Você
        também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
      </p>

      <h2>8. Segurança</h2>
      <p>
        Adotamos medidas técnicas e administrativas para proteger os dados:
        conexões criptografadas (HTTPS), senhas com hash, isolamento dos dados de
        cada Empresa no banco de dados, controle de acesso por papel, limite de
        tentativas de login e registros de auditoria do financeiro. Nenhum
        sistema é totalmente imune a incidentes; se ocorrer um incidente
        relevante, comunicaremos os afetados e a ANPD conforme a lei.
      </p>

      <h2>9. Cookies</h2>
      <p>
        Usamos apenas cookies essenciais, necessários para manter você conectado
        e proteger a sessão. Não usamos cookies de publicidade. Bloquear esses
        cookies no navegador impede o login.
      </p>

      <h2>10. Encarregado de dados (DPO)</h2>
      <p>
        {C.dpoName} &ndash; {C.dpoEmail}
        <br />
        {C.name}, {C.address}
      </p>

      <h2>11. Crianças e adolescentes</h2>
      <p>
        O painel é destinado a maiores de 18 anos. Dados de menores como
        clientes finais só devem ser cadastrados pela Empresa com o consentimento
        de um dos pais ou responsável, no melhor interesse do menor.
      </p>

      <h2>12. Alterações desta Política</h2>
      <p>
        Podemos atualizar esta Política. Mudanças relevantes serão avisadas no
        painel e exigirão novo aceite. A data da versão vigente aparece no topo
        desta página.
      </p>
    </LegalPage>
  );
}
