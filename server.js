// server.js
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');

let twilio = null;

// Load Twilio ONLY if valid SID is provided (starts with AC)
if (process.env.TWILIO_SID && process.env.TWILIO_SID.startsWith("AC")) {
  twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
} else {
  console.log("⚠️ Twilio disabled (No valid TWILIO_SID). OTP will be shown in logs.");
}

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ---------- Dummy In-memory Storage (for demo) ----------
const jobs = [
  { jobId: "job_101", title: "Frontend Developer", company: "Acme", location: "Bengaluru", exp: "2-4 yrs", snippet: "React, JS", desc: "Build UI for web apps." },
  { jobId: "job_102", title: "Backend Engineer", company: "Bolt", location: "Mumbai", exp: "3-6 yrs", snippet: "Node.js, DB", desc: "Design APIs and microservices." }
];

const applications = [];
const otpStore = {};

function hashOtp(otp) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'secret')
               .update(otp)
               .digest('hex');
}

function randomId(prefix = 'id') {
  return prefix + '_' + Date.now();
}

// ---------- API Endpoints ----------

// 1) Fetch jobs
app.get('/searchJobs', (req, res) => {
  const q = (req.query.keywords || '').toLowerCase();
  const out = jobs.filter(j =>
    !q ||
    j.title.toLowerCase().includes(q) ||
    j.snippet.toLowerCase().includes(q)
  );
  return res.json(out.slice(0, 10));
});

// 2) Job details
app.get('/job/:id', (req, res) => {
  const job = jobs.find(j => j.jobId === req.params.id);
  return res.json(job || {});
});

// 3) Send OTP
app.post('/sendOtp', async (req, res) => {
  const { phone } = req.body;

  if (!phone) return res.status(400).json({ error: 'phone required' });

  const otp = '' + Math.floor(1000 + Math.random() * 9000);
  const hash = hashOtp(otp);

  otpStore[phone] = { hash, expires: Date.now() + 5 * 60 * 1000 };

  try {
    if (twilio) {
      await twilio.messages.create({
        body: `Your OTP is: ${otp}`,
        to: phone,
        from: process.env.TWILIO_FROM
      });
      console.log("✔️ OTP sent using Twilio");
    } else {
      console.log("⚠️ Twilio disabled. OTP:", otp);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Twilio Error:", err);
    return res.status(500).json({ error: 'OTP sending failed' });
  }
});

// 4) Verify OTP
app.post('/verifyOtp', (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) return res.status(400).json({ error: 'phone and otp required' });

  const record = otpStore[phone];
  if (!record) return res.status(400).json({ error: 'OTP not found' });
  if (Date.now() > record.expires) return res.status(400).json({ error: 'OTP expired' });
  if (record.hash !== hashOtp(otp)) return res.status(400).json({ error: 'Invalid OTP' });

  delete otpStore[phone];
  return res.json({ ok: true });
});

// 5) Apply for job
app.post('/apply', (req, res) => {
  const { name, email, phone, jobId, resumeUrl } = req.body;

  if (!name || !email || !phone || !jobId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const appId = randomId('app');
  const appObj = {
    id: appId,
    jobId,
    name,
    email,
    phone,
    resumeUrl: resumeUrl || '',
    status: 'Applied',
    createdAt: new Date().toISOString()
  };

  applications.push(appObj);

  return res.json({ ok: true, applicationId: appId });
});

// 6) My Jobs
app.get('/applications', (req, res) => {
  const { email } = req.query;

  if (!email) return res.status(400).json({ error: 'email required' });

  const out = applications.filter(a => a.email.toLowerCase() === email.toLowerCase());
  return res.json(out);
});

// 7) Operator view
app.get('/operator/visitorInfo', (req, res) => {
  const { email } = req.query;

  if (!email) return res.json({ profile: null, applications: [] });

  const profile = { email };
  const apps = applications.filter(a => a.email.toLowerCase() === email.toLowerCase());

  return res.json({ profile, applications: apps });
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server running on Port", PORT));
