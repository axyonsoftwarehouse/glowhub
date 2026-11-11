import Link from "next/link";
import { LEGAL_COMPANY as C, LEGAL_VERSIONS } from "@/lib/legal";
import { LegalPage } from "../legal-layout";

export const metadata = { title: "Termos de Uso · GlowHub" };

export default function TermsPage() {
  return (
    <LegalPage title="Termos de Uso" version={LEGAL_VERSIONS.terms}>
      <p>
        Estes Termos de Uso regulam o acesso e o uso do GlowHub, plataforma de
        agendamento e gestão para negócios de beleza e estética, oferecida por{" "}
        {C.name}, inscrita no CNPJ {C.cnpj}, com sede em {C.address}
        {" "}(&ldquo;GlowHub&rdquo;, &ldquo;nós&rdquo;). Ao criar uma conta ou usar
        a plataforma, você declara que leu e concorda com estes Termos e com a{" "}
        <Link href="/privacidade" className="text-brand underline">
          Política de Privacidade
        </Link>
        .
      </p>

      <h2>1. Definições</h2>
      <ul>
        <li>
          <strong>Empresa:</strong> o negócio (salão, barbearia, clínica, estúdio
          ou profissional autônomo) que contrata o GlowHub para gerir sua operação.
        </li>
        <li>
          <strong>Usuário:</strong> a pessoa com acesso ao painel em nome de uma
          Empresa (proprietário, gerente, recepção ou profissional).
        </li>
        <li>
          <strong>Cliente final:</strong> a pessoa que agenda ou é atendida pela
          Empresa, inclusive pelo agendamento online.
        </li>
        <li>
          <strong>Dados da Empresa:</strong> todas as informações inseridas na
          plataforma pela Empresa ou por seus Usuários e Clientes finais.
        </li>
      </ul>

      <h2>2. Objeto</h2>
      <p>
        O GlowHub oferece, no modelo de software como serviço, ferramentas de
        agenda, cadastro de clientes, catálogo, estoque, financeiro, cobrança,
        fidelização, relatórios, agendamento online e comunicação com clientes. As
        funcionalidades disponíveis podem variar conforme o plano contratado e
        evoluir ao longo do tempo.
      </p>

      <h2>3. Conta e acesso</h2>
      <ul>
        <li>Para usar o painel é preciso ter 18 anos ou mais e informar dados verdadeiros.</li>
        <li>
          Você é responsável por manter sua senha em sigilo e por toda atividade
          feita com sua conta. Avise-nos imediatamente em caso de uso não autorizado.
        </li>
        <li>
          O proprietário da Empresa define quem tem acesso e com qual papel, e
          responde pelos atos dos Usuários que convidar.
        </li>
      </ul>

      <h2>4. Planos, pagamento e cancelamento</h2>
      <p>
        O uso pode ser gratuito por período de avaliação ou remunerado conforme o
        plano escolhido, com preços e limites informados no momento da
        contratação. A falta de pagamento pode levar à suspensão do acesso após
        aviso prévio. A Empresa pode cancelar a qualquer momento; o cancelamento
        vale para o período seguinte ao já pago, sem reembolso proporcional, salvo
        disposição legal em contrário.
      </p>
      <p>
        Pagamentos que a Empresa recebe de seus Clientes finais por meio da
        plataforma são processados por provedores de pagamento terceiros, sujeitos
        aos termos desses provedores. O GlowHub não é parte da relação de consumo
        entre a Empresa e seus Clientes finais.
      </p>

      <h2>5. Responsabilidades da Empresa</h2>
      <ul>
        <li>
          Usar a plataforma de acordo com a lei, inclusive a Lei Geral de Proteção
          de Dados (Lei 13.709/2018 &ndash; LGPD) e o Código de Defesa do Consumidor.
        </li>
        <li>
          Em relação aos dados dos seus Clientes finais, a Empresa é a{" "}
          <strong>controladora</strong>: cabe a ela ter base legal para coletá-los,
          informar seus clientes e atender aos pedidos deles. O GlowHub atua como{" "}
          <strong>operador</strong>, tratando esses dados apenas segundo as
          instruções da Empresa e para prestar o serviço.
        </li>
        <li>
          Obter o consentimento dos Clientes finais quando exigido, por exemplo
          para envio de campanhas de marketing.
        </li>
        <li>Manter a veracidade dos preços, serviços e informações publicadas.</li>
      </ul>

      <h2>6. Uso proibido</h2>
      <p>É proibido:</p>
      <ul>
        <li>enviar comunicações não solicitadas (spam) ou conteúdo ilícito;</li>
        <li>tentar acessar dados de outras Empresas ou burlar mecanismos de segurança;</li>
        <li>fazer engenharia reversa, copiar ou revender a plataforma;</li>
        <li>sobrecarregar a infraestrutura por meio de acessos automatizados abusivos;</li>
        <li>usar a plataforma para fins fraudulentos ou que violem direitos de terceiros.</li>
      </ul>
      <p>
        O descumprimento pode levar à suspensão ou ao encerramento da conta, sem
        prejuízo de outras medidas cabíveis.
      </p>

      <h2>7. Dados da Empresa</h2>
      <p>
        Os Dados da Empresa pertencem à Empresa. Não os vendemos nem os usamos
        para finalidades próprias além da prestação, segurança e melhoria do
        serviço, nos termos da Política de Privacidade. Após o encerramento da
        conta, a Empresa pode solicitar a exportação dos seus dados em até 30
        dias; depois disso, eles serão excluídos ou anonimizados, salvo os que
        precisarmos manter por obrigação legal (por exemplo, registros fiscais e
        de acesso).
      </p>

      <h2>8. Disponibilidade e suporte</h2>
      <p>
        Empregamos esforços razoáveis para manter a plataforma disponível e
        segura, mas podem ocorrer interrupções para manutenção, por falhas de
        terceiros ou por motivo de força maior. Recomendamos que a Empresa mantenha
        suas próprias rotinas de conferência dos registros importantes.
      </p>

      <h2>9. Propriedade intelectual</h2>
      <p>
        A marca GlowHub, o software, o design e a documentação são de nossa
        titularidade ou licenciados a nós. Estes Termos concedem apenas uma
        licença de uso pessoal, não exclusiva e intransferível enquanto a conta
        estiver ativa.
      </p>

      <h2>10. Limitação de responsabilidade</h2>
      <p>
        Na máxima extensão permitida pela lei, o GlowHub não responde por lucros
        cessantes, perda de receita ou danos indiretos, nem por decisões tomadas
        com base nos relatórios da plataforma. A responsabilidade total do GlowHub
        fica limitada ao valor pago pela Empresa nos 12 meses anteriores ao
        evento. Esta limitação não se aplica a casos de dolo ou culpa grave, nem
        afasta direitos garantidos pelo Código de Defesa do Consumidor quando
        aplicável.
      </p>

      <h2>11. Alterações</h2>
      <p>
        Podemos atualizar estes Termos. Mudanças relevantes serão informadas no
        painel e exigirão novo aceite para continuar usando a plataforma. A data
        da versão vigente aparece no topo desta página.
      </p>

      <h2>12. Lei aplicável e foro</h2>
      <p>
        Estes Termos são regidos pelas leis brasileiras. Fica eleito o foro da
        comarca de {C.forum}, ressalvado o direito do consumidor de propor ação no
        foro do seu domicílio.
      </p>

      <h2>13. Contato</h2>
      <p>Dúvidas sobre estes Termos: {C.contactEmail}.</p>
    </LegalPage>
  );
}
