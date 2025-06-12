#!/usr/bin/env python3
"""
Script para ejecutar la aplicación localmente en modo desarrollo
"""
import os
from app import app

if __name__ == '__main__':
    # Configuración para desarrollo local
    os.environ.setdefault('FLASK_ENV', 'development')
    os.environ.setdefault('FLASK_DEBUG', '1')
    
    print("🚀 Iniciando servidor de desarrollo...")
    print("📱 Aplicación disponible en: http://localhost:5000")
    print("🔧 Modo: Desarrollo (Flask dev server)")
    print("⚠️  Para producción usar: gunicorn -c gunicorn.conf.py app:app")
    
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True
    ) 