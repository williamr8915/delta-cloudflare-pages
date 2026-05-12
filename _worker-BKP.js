const DEFAULT_CONTACT_EMAIL = "contato@deltaintermediacoes.com.br";
const DEFAULT_FROM_EMAIL = "site@deltaintermediacoes.com.br";
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

async function parsePayload(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return await request.json();
  }
  const formData = await request.formData();
  return Object.fromEntries(formData.entries());
}

function buildEmailHtml(data) {
  const rows = [
    ["Nome", data.nome],
    ["E-mail", data.email],
    ["Telefone", data.telefone],
    ["Empresa", data.empresa],
    ["Tipo de demanda", data.tipo_demanda],
    ["Horizonte", data.horizonte],
    ["Matrícula", data.matricula],
    ["Endereço", data.endereco_imovel],
    ["Frente (m)", data.frente_metros],
    ["Comprimento/Fundo (m)", data.fundo_metros],
    ["Área total estimada (m²)", data.area_total_m2],
  ].filter(([, value]) => String(value || "").trim() !== "");

  const tableRows = rows
    .map(([label, value]) => `<tr><td style="padding:10px 12px;border:1px solid #dbe5e8;font-weight:700;background:#f7fafb;">${escapeHtml(label)}</td><td style="padding:10px 12px;border:1px solid #dbe5e8;">${escapeHtml(value)}</td></tr>`)
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;color:#1f2933;max-width:760px;margin:0 auto;">
      <h2 style="color:#0A2D36;margin-bottom:16px;">Novo contato pelo site da Delta</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">${tableRows}</table>
      <div style="padding:16px 18px;border:1px solid #dbe5e8;border-radius:14px;background:#ffffff;">
        <strong style="display:block;margin-bottom:10px;color:#0A2D36;">Contexto inicial</strong>
        <div style="white-space:pre-wrap;line-height:1.7;">${escapeHtml(data.contexto || "")}</div>
      </div>
    </div>
  `;
}

async function handleContact(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (request.method !== "POST") {
    return json({ error: "Método não permitido." }, 405, { "Allow": "POST, OPTIONS" });
  }

  const data = await parsePayload(request);
  const payload = {
    nome: String(data.nome || "").trim(),
    email: String(data.email || "").trim(),
    telefone: String(data.telefone || "").trim(),
    empresa: String(data.empresa || "").trim(),
    tipo_demanda: String(data.tipo_demanda || "").trim(),
    horizonte: String(data.horizonte || "").trim(),
    contexto: String(data.contexto || "").trim(),
    matricula: String(data.matricula || "").trim(),
    endereco_imovel: String(data.endereco_imovel || "").trim(),
    frente_metros: String(data.frente_metros || "").trim(),
    fundo_metros: String(data.fundo_metros || "").trim(),
    area_total_m2: String(data.area_total_m2 || "").trim(),
    website: String(data.website || "").trim(),
  };

  if (payload.website) {
    return json({ message: "Solicitação recebida." });
  }

  if (!payload.nome || !isEmail(payload.email) || !payload.tipo_demanda || !payload.contexto) {
    return json({ error: "Preencha nome, e-mail válido, tipo de demanda e contexto inicial." }, 400);
  }

  if (payload.tipo_demanda === "Intermediação de terreno/imóvel") {
    if (!payload.matricula || !payload.endereco_imovel || !payload.frente_metros || !payload.fundo_metros || !payload.area_total_m2) {
      return json({ error: "Para intermediação de terreno/imóvel, preencha matrícula, endereço e metragem." }, 400);
    }
  }

  const resendApiKey = env.RESEND_API_KEY;
  const contactEmail = env.CONTACT_EMAIL || DEFAULT_CONTACT_EMAIL;
  const fromEmail = env.FROM_EMAIL || DEFAULT_FROM_EMAIL;

  if (!resendApiKey) {
    return json({ error: "O formulário está pronto, mas o envio ainda depende da configuração da variável RESEND_API_KEY no Cloudflare Pages." }, 503);
  }

  const subject = `[Site Delta] ${payload.tipo_demanda} — ${payload.nome}`;
  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [contactEmail],
      reply_to: payload.email,
      subject,
      html: buildEmailHtml(payload),
    }),
  });

  const resendData = await resendResponse.json().catch(() => ({}));
  if (!resendResponse.ok) {
    return json({ error: resendData?.message || resendData?.error || "Falha ao enviar o e-mail pelo provedor configurado." }, 502);
  }

  const acceptsJson = (request.headers.get("accept") || "").includes("application/json");
  if (!acceptsJson) {
    const origin = new URL(request.url).origin;
    return Response.redirect(`${origin}/#formulario-contato`, 303);
  }

  return json({ message: "Mensagem enviada com sucesso. A Delta retornará pelo e-mail informado.", id: resendData?.id || null });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/contact") {
      return handleContact(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
