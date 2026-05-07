require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const path = require('path');
const { MercadoPagoConfig, Preference } = require('mercadopago');

// Configurar MercadoPago
const mpClient = new MercadoPagoConfig({ 
  accessToken: process.env.MP_ACCESS_TOKEN || 'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000' 
});

const app = express();
const port = process.env.PORT || 3000;

// Configurar Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Middleware
app.use(cors());
app.use(express.json());

// Servir la página HTML estática
app.use(express.static(__dirname));

// Ruta principal para servir el HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'generador-clases-ia.html'));
});

// Endpoint para generar el plan de clase
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt } = req.body;

    // Configurar los headers para Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Llamar a Groq con Llama 3
    const stream = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      model: 'llama-3.3-70b-versatile',
      stream: true,
      max_tokens: 2000,
      temperature: 0.7,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        // Enviar el texto como un evento SSE usando formato JSON simple
        res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Error generando con Groq:', error);
    res.status(500).json({ error: 'Ocurrió un error al generar el plan.' });
  }
});

// Endpoint para crear la preferencia de pago en MercadoPago
app.post('/api/checkout', async (req, res) => {
  try {
    const { email } = req.body;
    
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.get('host');
    const baseUrl = `https://${host}`; // Forzamos https para Render
    
    console.log('Generando preferencia de pago para:', baseUrl);
    
    const preference = new Preference(mpClient);
    
    const response = await preference.create({
      body: {
        items: [
          {
            title: 'Suscripción Pro Aulanexa (1 Mes)',
            unit_price: 5,
            quantity: 1,
            currency_id: 'USD'
          }
        ],
        payer: {
          email: email
        },
        back_urls: {
          success: `${baseUrl}/?status=success`,
          failure: `${baseUrl}/?status=failure`,
          pending: `${baseUrl}/?status=pending`
        },
        auto_return: 'approved',
      }
    });

    res.json({ init_point: response.init_point });
  } catch (error) {
    console.error('Error al crear preferencia de MercadoPago:', error);
    res.status(500).json({ error: 'No se pudo iniciar el checkout' });
  }
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`\nServidor de Aulanexa escuchando en http://localhost:${port}`);
  console.log(`Por favor, asegúrate de haber configurado tu clave en el archivo .env\n`);
});
