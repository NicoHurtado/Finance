# 💰 Plataforma de Finanzas Personales

Una aplicación web moderna y elegante para gestionar finanzas personales con integración de Google Sheets y asistente de IA.

## ✨ Características

- 🔐 **Autenticación segura** con códigos de acceso personalizados
- 📊 **Dashboard interactivo** con métricas financieras en tiempo real
- 💳 **Gestión de transacciones** de débito y crédito
- 🔍 **Filtros y búsqueda** avanzados en todas las tablas
- 📈 **Gráficas y estadísticas** avanzadas con Chart.js y Plotly
- 📉 **Análisis predictivo** con forecasting de gastos
- 🤖 **Asistente financiero IA** powered by Google Gemini
- ☁️ **Sincronización con Google Sheets** como base de datos
- 📱 **Diseño responsive** para dispositivos móviles
- 🎨 **Interfaz moderna** con Bootstrap 5

## 🚀 Instalación y Configuración

### 1. Clonar el repositorio
```bash
git clone <tu-repositorio>
cd Finance
```

### 2. Instalar dependencias
```bash
pip install -r requirements.txt
```

### 3. Configurar variables de entorno
1. Copia el contenido de `env_template.txt`
2. Crea un archivo `.env` en la raíz del proyecto
3. Completa todas las variables con tus credenciales reales

### 4. Configurar Google Sheets API
1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un proyecto nuevo o selecciona uno existente
3. Habilita la **Google Sheets API**
4. Crea una **cuenta de servicio**
5. Descarga el archivo JSON de credenciales
6. Copia los valores al archivo `.env`

### 5. Configurar Gemini AI (Opcional)
1. Ve a [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Genera una API key
3. Agrégala a tu archivo `.env` como `GEMINI_API_KEY`

### 6. Ejecutar la aplicación
```bash
python3 app.py
```

La aplicación estará disponible en `http://localhost:5000`

## 🔧 Configuración de Usuarios

Edita la variable `USERS_JSON` en tu archivo `.env` con la información de tus usuarios:

```json
{
  "Nico2025": {
    "name": "Nico",
    "sheet_url": "https://docs.google.com/spreadsheets/d/TU_SHEET_ID",
    "sheet_id": "TU_SHEET_ID",
    "created_at": "2025-06-01"
  }
}
```

## 🔒 Seguridad

- ✅ Archivo `.env` incluido en `.gitignore`
- ✅ Credenciales nunca hardcodeadas en el código
- ✅ Fallback a credenciales de respaldo si es necesario
- ✅ Validación de variables de entorno requeridas 
