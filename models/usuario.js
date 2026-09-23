const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ---------------------------------------------------------
// 1. SUBDOCUMENTOS (Estructuras hijas)
// ---------------------------------------------------------

// A. El esquema para una opción individual (Ej: "Cheddar" - $500)
const opcionToppingSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    precio: { type: Number, default: 0 },
    disponible: { type: Boolean, default: true }
});

// B. El esquema para el grupo entero (Ej: "Agregados para Hamburguesas")
const grupoToppingSchema = new mongoose.Schema({
    nombre: { type: String, required: true }, // Título del grupo
    categoriaDestino: { type: Array, required: true }, // A qué categoría aplica (ej: "Hamburguesas")
    esMultiselect: { type: Boolean, default: true }, // true = puede elegir varios, false = elige solo 1
    opciones: [opcionToppingSchema] // Lista de las opciones definidas arriba
});

// C. Extraemos tu esquema de platos para que quede más limpio
const platoSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    descripcion: { type: String },
    precio: { type: Number, required: true },
    categoria: { type: String, required: true },
    disponible: { type: Boolean, default: true },
    esMenuDelDia: { type: Boolean, default: false },
    esEspecialidad: { type: Boolean, default: false },
    enPromocion: { type: Boolean, default: false },
    porcentajeDescuento: { type: Number, default: 0 },
    fotoUrl: { type: String, default: '' }, // URL de la foto del plato (opcional)
    toppings: [{
        grupo: { type: String },
        opciones: [{ type: String }]
    }]
});


// ---------------------------------------------------------
// 2. ESQUEMA PRINCIPAL (El Padre)
// ---------------------------------------------------------
const usuarioSchema = new mongoose.Schema({
    // Datos del local
    nombreDelLocal: { type: String, required: true},
    email: { type: String, required: true, unique: true },
    nombre: { type: String, required: true },
    password: { type: String, required: true },
    pinCrm: { type: String, required: true },
    fechaRegistro: { type: Date, default: Date.now },
    
    // Perfil
    horarios: { type: String, default: "" },
    horariosEstructurados: [{
        dia: { type: String },
        apertura: { type: String },
        cierre: { type: String }
    }],
            telefono: { type: String, default: "" },
    direccion: { type: String, default: "" },
    fotoPerfil: { type: String, default: '' }, // URL de la foto/logo del local
    abierto: { type: Boolean, default: true },
    plan: { type: String, enum: ['web', 'bot', 'pro'], default: 'web' },
    temaMenu: { type: String, enum: ['clasico', 'elegante'], default: 'clasico' },
    colorMenu: { type: String, default: '#2563eb' },
    fuenteMenu: { type: String, enum: ['moderna', 'clasica', 'amigable'], default: 'moderna' },
    estiloTarjetas: { type: String, enum: ['clasico', 'elegante'], default: 'clasico' },
    permitirResenas: { type: Boolean, default: true },
    resenasPublicas: { type: Boolean, default: false },
    permitirVotosResenas: { type: Boolean, default: true },
    slug: { type: String, required: true, unique: true },

    // Métodos de pago que acepta el local
    metodosPago: [{
        tipo:    { type: String, enum: ['efectivo', 'transferencia', 'tarjeta'] },
        alias:   { type: String, default: '' },   // solo para transferencia
        titular: { type: String, default: '' }    // solo para transferencia
    }],

    // Listas (Subdocumentos)
    platos: [platoSchema],
    
    // 👇 ¡LO NUEVO! La lista de grupos de toppings
    gruposToppings: [grupoToppingSchema],

    // ===== Roles / Agentes =====
    rol: { type: String, enum: ['admin', 'agente'], default: 'admin' },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    empresasAcceso: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Empresa', default: [] }],
    activo: { type: Boolean, default: true },

    // ===== Monedero / Sistema de pagos =====
    saldoUsd: { type: Number, default: 0 },
    deudaToleradaUsd: { type: Number, default: 5 },
    deudaPendienteUsd: { type: Number, default: 0 },
    costoCicloActualUsd: { type: Number, default: 0 },
    fechaCicloFacturacion: { type: Date, default: Date.now },
    costoPorConversacion: { type: Number, default: 0.035 },
    monederoBloqueado: { type: Boolean, default: false },
    avisoEnviado: { type: Boolean, default: false }
});

// Hashear el PIN antes de guardar
usuarioSchema.pre('save', async function (next) {
  if (!this.isModified('pinCrm')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.pinCrm = await bcrypt.hash(this.pinCrm, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// PONÉ ESTA LÍNEA:
module.exports = mongoose.models.Usuario || mongoose.model('Usuario', usuarioSchema);
