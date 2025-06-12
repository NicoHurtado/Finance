from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash
import os
import json
import gspread
from google.oauth2.service_account import Credentials
import google.generativeai as genai
import pandas as pd
import plotly.graph_objs as go
import plotly.utils
from datetime import datetime, timedelta
from dotenv import load_dotenv
import re

# Cargar variables de entorno
load_dotenv()

app = Flask(__name__)
app.secret_key = 'your-secret-key-here'

# Configuración de Google Sheets
SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']

# Variables globales para caché de credenciales
_cached_credentials = None

# Caché global para las conexiones de FinanceManager
_finance_managers = {}

def get_google_credentials():
    """Obtiene las credenciales de Google desde el archivo .env"""
    global _cached_credentials
    
    # Si ya tenemos credenciales en caché, las devolvemos
    if _cached_credentials is not None:
        return _cached_credentials
    
    try:
        # Método 1: Intentar cargar desde GOOGLE_CREDENTIALS_JSON (formato completo)
        credentials_json_str = os.getenv('GOOGLE_CREDENTIALS_JSON')
        if credentials_json_str:
            try:
                credentials_json = json.loads(credentials_json_str)
                _cached_credentials = Credentials.from_service_account_info(credentials_json, scopes=SCOPES)
                print("✅ Credenciales de Google cargadas desde GOOGLE_CREDENTIALS_JSON")
                return _cached_credentials
            except json.JSONDecodeError as e:
                print(f"❌ Error parseando GOOGLE_CREDENTIALS_JSON: {e}")
                raise e
        
        # Verificar que las credenciales esenciales estén presentes
        required_fields = ['project_id', 'private_key_id', 'private_key', 'client_email', 'client_id']
        missing_fields = [field for field in required_fields if not credentials_json.get(field)]
        
        if missing_fields:
            raise ValueError(f"Faltan las siguientes variables de entorno: {', '.join([f'GOOGLE_{field.upper()}' for field in missing_fields])}")
        
        # Crear las credenciales y guardarlas en caché
        _cached_credentials = Credentials.from_service_account_info(credentials_json, scopes=SCOPES)
        print("✅ Credenciales de Google cargadas desde variables individuales")
        return _cached_credentials
        
    except Exception as e:
        print(f"❌ Error cargando credenciales desde .env: {e}")
        


def get_users():
    """Obtiene la lista de usuarios desde las variables de entorno"""
    users_json_str = os.getenv('USERS_JSON')
    if not users_json_str:
        # Usar los datos que proporcionaste
        users_json_str = '{"Nico2025":{"name":"Nico","sheet_url":"https://docs.google.com/spreadsheets/d/1TviMbrdTLLQbU2x2od3eXSri1SVYoTvxHPC6G_VmKDg","sheet_id":"1TviMbrdTLLQbU2x2od3eXSri1SVYoTvxHPC6G_VmKDg","created_at":"2025-06-01"},"Nando2025":{"name":"Nando","sheet_url":"https://docs.google.com/spreadsheets/d/1VZIwAG9-NgLYQKmAsMh0GtNaa1F3-Iy7izsrlHkza70","sheet_id":"1VZIwAG9-NgLYQKmAsMh0GtNaa1F3-Iy7izsrlHkza70","created_at":"2025-06-01"},"Moni2025":{"name":"Monica","sheet_url":"https://docs.google.com/spreadsheets/d/1s-XaYKQg9Gy4DqeZnVL8KVooVvzaJBeFrWTMkQyLEVs","sheet_id":"1s-XaYKQg9Gy4DqeZnVL8KVooVvzaJBeFrWTMkQyLEVs","created_at":"2025-06-01"}}'
    
    return json.loads(users_json_str)

# Configurar Gemini AI
try:
    genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
    model = genai.GenerativeModel('gemini-1.5-flash')
    AI_ENABLED = True
except Exception as e:
    AI_ENABLED = False
    print(f"IA no disponible: {e}")

def format_cop(amount):
    """Formatea un número como moneda COP"""
    try:
        # Convertir a float y tomar valor absoluto
        amount = abs(float(amount))
        # Formatear con separadores de miles y dos decimales
        formatted = "${:,.0f}".format(amount)
        # Reemplazar coma por punto para miles
        formatted = formatted.replace(',', '.')
        return formatted
    except:
        return "$0"

def format_date_mobile(date_str):
    """Formatea una fecha para mostrar en móvil (MM/DD)"""
    try:
        if not date_str:
            return ""
        
        # Si la fecha está en formato YYYY-MM-DD
        if '-' in str(date_str) and len(str(date_str)) >= 10:
            parts = str(date_str).split('-')
            if len(parts) >= 3:
                month = parts[1]
                day = parts[2][:2]  # Solo los primeros 2 caracteres del día
                return f"{month}/{day}"
        
        # Si la fecha está en formato DD/MM/YYYY o MM/DD/YYYY
        if '/' in str(date_str):
            parts = str(date_str).split('/')
            if len(parts) >= 2:
                return f"{parts[0]}/{parts[1]}"
        
        # Si no se puede parsear, devolver los últimos 5 caracteres
        return str(date_str)[-5:] if len(str(date_str)) > 5 else str(date_str)
    except:
        return str(date_str)[:5] if date_str else ""

def format_number(value):
    """Formatea un número con separadores de miles"""
    try:
        if value is None:
            return "0"
        num = float(value)
        return "{:,.0f}".format(num)
    except:
        return "0"

def format_percentage(value):
    """Formatea un número como porcentaje"""
    try:
        if value is None:
            return "0.0"
        num = float(value)
        return "{:.1f}".format(num)
    except:
        return "0.0"

# Registrar los filtros personalizados
app.jinja_env.filters['mobile_date'] = format_date_mobile
app.jinja_env.filters['format_number'] = format_number
app.jinja_env.filters['format_percentage'] = format_percentage

class FinanceManager:
    def __init__(self, user_data):
        """Inicializa o recupera una instancia existente del FinanceManager"""
        global _finance_managers
        
        # Si ya existe una instancia para este usuario, la devolvemos
        if user_data['sheet_id'] in _finance_managers:
            manager = _finance_managers[user_data['sheet_id']]
            # Actualizar user_data por si cambió
            manager.user_data = user_data
            # Copiar atributos a self
            self.__dict__.update(manager.__dict__)
            return
        
        # Si no existe, creamos una nueva instancia
        self.user_data = user_data
        self.credentials = None
        self.gc = None
        self.sheet = None
        self._connect_with_retry()
        
        # Guardar en caché
        _finance_managers[user_data['sheet_id']] = self
    
    def _connect_with_retry(self, max_retries=3):
        """Conecta a Google Sheets con reintentos automáticos"""
        # Si ya estamos conectados, no hacer nada
        if self.sheet is not None:
            return
            
        import time
        
        for attempt in range(max_retries):
            try:
                self.credentials = get_google_credentials()
                self.gc = gspread.authorize(self.credentials)
                self.sheet = self.gc.open_by_key(self.user_data['sheet_id'])
                print(f"Conectado a Google Sheet: {self.user_data['name']}")
                return
            except Exception as e:
                print(f"Error conectando (intento {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) + 1
                    print(f"Reintentando en {wait_time} segundos...")
                    time.sleep(wait_time)
                else:
                    print("No se pudo conectar a Google Sheets")
                    raise e
    
    def _retry_operation(self, operation, max_retries=3):
        """Ejecuta una operación con reintentos automáticos"""
        import time
        
        for attempt in range(max_retries):
            try:
                return operation()
            except Exception as e:
                print(f"Error en operación (intento {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    wait_time = (2 ** attempt) + 1
                    print(f"Reintentando en {wait_time} segundos...")
                    time.sleep(wait_time)
                    # Reconectar si es necesario
                    try:
                        self._connect_with_retry(1)
                    except:
                        pass
                else:
                    raise e
    
    def get_debito_data(self):
        """Obtiene datos de la hoja 'debito'"""
        def _get_data():
            try:
                worksheet = self.sheet.worksheet('debito')
                
                # Verificar si la hoja tiene los headers correctos
                headers = worksheet.row_values(1)
                if not headers or headers != ['Fecha', 'Descripción', 'Monto', 'Categoría']:
                    worksheet.clear()
                    worksheet.append_row(['Fecha', 'Descripción', 'Monto', 'Categoría'])
                
                data = worksheet.get_all_records()
                if not data:
                    return pd.DataFrame(columns=['Fecha', 'Descripción', 'Monto', 'Categoría'])
                
                df = pd.DataFrame(data)
                # Limpiar y convertir montos
                if 'Monto' in df.columns:
                    df['Monto'] = df['Monto'].astype(str).str.replace('$', '').str.replace('.', '').str.replace(',', '.').str.replace(' ', '')
                    df['Monto'] = pd.to_numeric(df['Monto'], errors='coerce').fillna(0)
                    # Formatear montos para visualización
                    df['Monto_Display'] = df['Monto'].apply(format_cop)
                return df
            except gspread.WorksheetNotFound:
                # Crear la hoja si no existe
                worksheet = self.sheet.add_worksheet(title='debito', rows=1000, cols=4)
                worksheet.append_row(['Fecha', 'Descripción', 'Monto', 'Categoría'])
                return pd.DataFrame(columns=['Fecha', 'Descripción', 'Monto', 'Categoría'])
        
        try:
            return self._retry_operation(_get_data)
        except Exception as e:
            print(f"Error obteniendo datos de débito: {e}")
            return pd.DataFrame(columns=['Fecha', 'Descripción', 'Monto', 'Categoría'])
    
    def get_credito_data(self):
        """Obtiene datos de la hoja 'credito'"""
        def _get_data():
            try:
                worksheet = self.sheet.worksheet('credito')
                
                # Verificar si la hoja tiene los headers correctos
                headers = worksheet.row_values(1)
                if not headers or set(headers) != set(['Fecha', 'Descripción', 'Monto', 'Tarjeta', 'Estado']):
                    worksheet.clear()
                    worksheet.append_row(['Fecha', 'Descripción', 'Monto', 'Tarjeta', 'Estado'])
                
                data = worksheet.get_all_records()
                if not data:
                    return pd.DataFrame(columns=['Fecha', 'Descripción', 'Monto', 'Tarjeta', 'Estado'])
                
                df = pd.DataFrame(data)
                # Limpiar y convertir montos
                if 'Monto' in df.columns:
                    df['Monto'] = df['Monto'].astype(str).str.replace('$', '').str.replace('.', '').str.replace(',', '.').str.replace(' ', '')
                    df['Monto'] = pd.to_numeric(df['Monto'], errors='coerce').fillna(0)
                    # Formatear montos para visualización
                    df['Monto_Display'] = df['Monto'].apply(format_cop)
                return df
            except gspread.WorksheetNotFound:
                # Crear la hoja si no existe
                worksheet = self.sheet.add_worksheet(title='credito', rows=1000, cols=5)
                worksheet.append_row(['Fecha', 'Descripción', 'Monto', 'Tarjeta', 'Estado'])
                return pd.DataFrame(columns=['Fecha', 'Descripción', 'Monto', 'Tarjeta', 'Estado'])
        
        try:
            return self._retry_operation(_get_data)
        except Exception as e:
            print(f"Error obteniendo datos de crédito: {e}")
            return pd.DataFrame(columns=['Fecha', 'Descripción', 'Monto', 'Tarjeta', 'Estado'])
    
    def add_debito_transaction(self, fecha, descripcion, monto, categoria='Otros'):
        """Añade una nueva transacción de débito"""
        def _add_transaction():
            worksheet = self.sheet.worksheet('debito')
            worksheet.append_row([fecha, descripcion, float(monto), categoria])
            print(f"Transacción añadida: {fecha}, {descripcion}, {monto}, {categoria}")
            return True
        
        try:
            return self._retry_operation(_add_transaction)
        except Exception as e:
            print(f"Error añadiendo transacción: {e}")
            return False
    
    def add_credito_transaction(self, fecha, descripcion, monto, tarjeta, estado='Pendiente'):
        """Añade una nueva transacción de crédito"""
        def _add_transaction():
            worksheet = self.sheet.worksheet('credito')
            worksheet.append_row([fecha, descripcion, float(monto), tarjeta, estado])
            print(f"Gasto de tarjeta añadido: {fecha}, {descripcion}, {monto}, {tarjeta}, {estado}")
            return True
        
        try:
            return self._retry_operation(_add_transaction)
        except Exception as e:
            print(f"Error añadiendo transacción de crédito: {e}")
            return False
    
    def edit_debito_transaction(self, index, fecha, descripcion, monto, categoria):
        """Edita una transacción de débito existente"""
        def _edit_transaction():
            worksheet = self.sheet.worksheet('debito')
            # Las filas en Google Sheets empiezan en 1, y la primera fila son headers
            row_number = index + 2
            worksheet.update(f'A{row_number}:D{row_number}', [[fecha, descripcion, float(monto), categoria]])
            print(f"Transacción editada en fila {row_number}: {fecha}, {descripcion}, {monto}, {categoria}")
            return True
        
        try:
            return self._retry_operation(_edit_transaction)
        except Exception as e:
            print(f"Error editando transacción: {e}")
            return False
    
    def delete_debito_transaction(self, index):
        """Elimina una transacción de débito"""
        def _delete_transaction():
            worksheet = self.sheet.worksheet('debito')
            # Las filas en Google Sheets empiezan en 1, y la primera fila son headers
            row_number = index + 2
            worksheet.delete_rows(row_number)
            print(f"Transacción eliminada de la fila {row_number}")
            return True
        
        try:
            return self._retry_operation(_delete_transaction)
        except Exception as e:
            print(f"Error eliminando transacción: {e}")
            return False
    
    def edit_credito_transaction(self, index, fecha, descripcion, monto, tarjeta, estado):
        """Edita una transacción de crédito existente"""
        def _edit_transaction():
            worksheet = self.sheet.worksheet('credito')
            # Las filas en Google Sheets empiezan en 1, y la primera fila son headers
            row_number = index + 2
            worksheet.update(f'A{row_number}:E{row_number}', [[fecha, descripcion, float(monto), tarjeta, estado]])
            print(f"Transacción de crédito editada en fila {row_number}: {fecha}, {descripcion}, {monto}, {tarjeta}, {estado}")
            return True
        
        try:
            return self._retry_operation(_edit_transaction)
        except Exception as e:
            print(f"Error editando transacción de crédito: {e}")
            return False
    
    def delete_credito_transaction(self, index):
        """Elimina una transacción de crédito"""
        def _delete_transaction():
            worksheet = self.sheet.worksheet('credito')
            # Las filas en Google Sheets empiezan en 1, y la primera fila son headers
            row_number = index + 2
            worksheet.delete_rows(row_number)
            print(f"Transacción de crédito eliminada de la fila {row_number}")
            return True
        
        try:
            return self._retry_operation(_delete_transaction)
        except Exception as e:
            print(f"Error eliminando transacción de crédito: {e}")
            return False
    
    def get_dashboard_summary(self):
        """Calcula el resumen para el dashboard"""
        debito_df = self.get_debito_data()
        credito_df = self.get_credito_data()
        
        summary = {
            'balance_total': 0,
            'ingresos': 0,
            'gastos': 0,
            'tarjeta_pendiente': 0,
            'transacciones_recientes': [],
            'gastos_por_mes': {},
            'balance_mensual': {}
        }
        
        try:
            if not debito_df.empty and 'Monto' in debito_df.columns:
                # Calcular ingresos, egresos y balance
                print(f"[DEBUG] Debito_df shape: {debito_df.shape}")
                print(f"[DEBUG] Montos en la hoja: {debito_df['Monto'].tolist()}")
                
                # INGRESOS: solo valores positivos (verdes)
                ingresos = debito_df[debito_df['Monto'] > 0]['Monto'].sum()
                print(f"[DEBUG] Ingresos (valores positivos): {ingresos}")
                
                # EGRESOS: solo valores negativos (rojos) pero mostrados como positivos
                egresos = abs(debito_df[debito_df['Monto'] < 0]['Monto'].sum())
                print(f"[DEBUG] Egresos (valores negativos en positivo): {egresos}")
                
                # BALANCE TOTAL: suma de TODOS los valores (positivos + negativos)
                balance_total = debito_df['Monto'].sum()
                print(f"[DEBUG] Balance total (suma de todos): {balance_total}")
                
                summary['ingresos'] = float(ingresos) if not pd.isna(ingresos) else 0
                summary['gastos'] = float(egresos) if not pd.isna(egresos) else 0
                summary['balance_total'] = float(balance_total) if not pd.isna(balance_total) else 0
                
                # Formatear montos para visualización
                summary['ingresos_display'] = format_cop(summary['ingresos'])
                summary['gastos_display'] = format_cop(summary['gastos'])
                summary['balance_total_display'] = format_cop(summary['balance_total'])
                
                # Transacciones recientes (últimas 5)
                recent = debito_df.sort_values('Fecha', ascending=False).head(5).to_dict('records')
                for trans in recent:
                    if 'Monto' in trans:
                        trans['Monto_Display'] = format_cop(trans['Monto'])
                summary['transacciones_recientes'] = recent
            
            if not credito_df.empty and 'Monto' in credito_df.columns:
                # Filtrar por estado pendiente
                pendientes_mask = credito_df['Estado'].astype(str).str.lower().isin(['pendiente', 'pending', ''])
                pendientes = credito_df[pendientes_mask]['Monto'].sum()
                summary['tarjeta_pendiente'] = float(abs(pendientes)) if pendientes else 0
                summary['tarjeta_pendiente_display'] = format_cop(abs(pendientes)) if pendientes else "$0"
            
            # Gastos por mes y balance mensual
            if not debito_df.empty and 'Monto' in debito_df.columns and 'Fecha' in debito_df.columns:
                # Convertir fechas con formato correcto
                debito_df['Fecha'] = pd.to_datetime(debito_df['Fecha'], format='%d/%m/%Y', errors='coerce')
                if debito_df['Fecha'].isna().all():
                    debito_df['Fecha'] = pd.to_datetime(debito_df['Fecha'], errors='coerce', dayfirst=True)
                debito_df['Mes'] = debito_df['Fecha'].dt.strftime('%Y-%m')
                
                # Gastos mensuales (solo valores negativos)
                gastos_mensuales = debito_df[debito_df['Monto'] < 0].groupby('Mes')['Monto'].sum().abs()
                # Balance mensual (ingresos - gastos)
                balance_mensual = debito_df.groupby('Mes')['Monto'].sum()
                
                # Ordenar por mes
                gastos_mensuales = gastos_mensuales.sort_index()
                balance_mensual = balance_mensual.sort_index()
                
                # Formatear para las gráficas
                summary['gastos_por_mes'] = {
                    'labels': gastos_mensuales.index.tolist(),
                    'values': gastos_mensuales.values.tolist(),
                    'formatted_values': [format_cop(v) for v in gastos_mensuales.values]
                }
                
                summary['balance_mensual'] = {
                    'labels': balance_mensual.index.tolist(),
                    'values': balance_mensual.values.tolist(),
                    'formatted_values': [format_cop(v) for v in balance_mensual.values]
                }
            
            # Estado de tarjetas
            if not credito_df.empty and 'Monto' in credito_df.columns and 'Estado' in credito_df.columns:
                estado_tarjetas = credito_df.groupby('Estado')['Monto'].sum().abs()
                summary['estado_tarjetas'] = {
                    'labels': estado_tarjetas.index.tolist(),
                    'values': estado_tarjetas.values.tolist(),
                    'formatted_values': [format_cop(v) for v in estado_tarjetas.values]
                }
        
        except Exception as e:
            print(f"Error calculando resumen: {e}")
        
        return summary

@app.route('/')
def login():
    """Página de login"""
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return render_template('login.html')

@app.route('/authenticate', methods=['POST'])
def authenticate():
    """Autentica al usuario"""
    password = request.form.get('password')
    users = get_users()
    
    if password in users:
        session['user_id'] = password
        session['user_data'] = users[password]
        flash(f'¡Bienvenido, {users[password]["name"]}!', 'success')
        return redirect(url_for('dashboard'))
    else:
        flash('Contraseña incorrecta', 'error')
        return redirect(url_for('login'))

@app.route('/logout')
def logout():
    """Cierra la sesión del usuario"""
    session.clear()
    return redirect(url_for('login'))

@app.route('/dashboard')
def dashboard():
    """Dashboard principal"""
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    try:
        finance_manager = FinanceManager(session['user_data'])
        summary = finance_manager.get_dashboard_summary()
        return render_template('dashboard.html', summary=summary, user=session['user_data'])
    except Exception as e:
        flash(f'Error cargando datos: {str(e)}', 'error')
        # Datos de respaldo en caso de error
        summary = {
            'balance_total': 0,
            'ingresos': 0,
            'gastos': 0,
            'tarjeta_pendiente': 0,
            'transacciones_recientes': [],
            'gastos_por_mes': {},
            'balance_mensual': {},
            'estado_tarjetas': {}
        }
        return render_template('dashboard.html', summary=summary, user=session['user_data'])

@app.route('/transacciones')
def transacciones():
    """Página de gestión de transacciones"""
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    try:
        finance_manager = FinanceManager(session['user_data'])
        debito_df = finance_manager.get_debito_data()
        transacciones = debito_df.to_dict('records') if not debito_df.empty else []
        return render_template('transacciones.html', transacciones=transacciones, user=session['user_data'])
    except Exception as e:
        flash(f'Error cargando transacciones: {str(e)}', 'error')
        return render_template('transacciones.html', transacciones=[], user=session['user_data'])

@app.route('/add_transaction', methods=['POST'])
def add_transaction():
    """Añade una nueva transacción"""
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    try:
        finance_manager = FinanceManager(session['user_data'])
        fecha = request.form.get('fecha')
        descripcion = request.form.get('descripcion')
        categoria = request.form.get('categoria')
        monto = float(request.form.get('monto'))
        
        if finance_manager.add_debito_transaction(fecha, descripcion, monto, categoria):
            flash('Transacción añadida exitosamente', 'success')
        else:
            flash('Error añadiendo transacción', 'error')
    except Exception as e:
        flash(f'Error: {str(e)}', 'error')
    
    return redirect(url_for('transacciones'))

@app.route('/edit_transaction', methods=['POST'])
def edit_transaction():
    """Edita una transacción existente"""
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    try:
        finance_manager = FinanceManager(session['user_data'])
        index = int(request.form.get('index'))
        fecha = request.form.get('fecha')
        descripcion = request.form.get('descripcion')
        categoria = request.form.get('categoria')
        monto = float(request.form.get('monto'))
        
        if finance_manager.edit_debito_transaction(index, fecha, descripcion, monto, categoria):
            flash('Transacción actualizada exitosamente', 'success')
        else:
            flash('Error actualizando transacción', 'error')
    except Exception as e:
        flash(f'Error: {str(e)}', 'error')
    
    return redirect(url_for('transacciones'))

@app.route('/delete_transaction', methods=['POST'])
def delete_transaction():
    """Elimina una transacción"""
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    try:
        finance_manager = FinanceManager(session['user_data'])
        index = int(request.form.get('index'))
        
        if finance_manager.delete_debito_transaction(index):
            flash('Transacción eliminada exitosamente', 'success')
        else:
            flash('Error eliminando transacción', 'error')
    except Exception as e:
        flash(f'Error: {str(e)}', 'error')
    
    return redirect(url_for('transacciones'))

@app.route('/tarjetas')
def tarjetas():
    """Página de gestión de tarjetas de crédito"""
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    try:
        finance_manager = FinanceManager(session['user_data'])
        credito_df = finance_manager.get_credito_data()
        
        # Calcular totales por estado
        total_pendiente = 0
        total_pagado = 0
        transacciones = []
        resumen_tarjetas = {}
        
        if not credito_df.empty:
            transacciones = credito_df.to_dict('records')
            
            # Calcular totales generales
            for t in transacciones:
                monto = float(t.get('Monto', 0))
                if 'Estado' in t and str(t['Estado']).lower() == 'pendiente':
                    total_pendiente += abs(monto)
                else:
                    total_pagado += abs(monto)
            
            # Calcular resumen por tarjeta
            for tarjeta in credito_df['Tarjeta'].unique():
                if pd.isna(tarjeta) or tarjeta == '':
                    continue
                    
                tarjeta_data = credito_df[credito_df['Tarjeta'] == tarjeta]
                
                # Calcular totales por estado para esta tarjeta
                pendiente_tarjeta = 0
                pagado_tarjeta = 0
                total_tarjeta = 0
                
                for _, row in tarjeta_data.iterrows():
                    monto = abs(float(row.get('Monto', 0)))
                    total_tarjeta += monto
                    
                    if str(row.get('Estado', '')).lower() == 'pendiente':
                        pendiente_tarjeta += monto
                    else:
                        pagado_tarjeta += monto
                
                resumen_tarjetas[tarjeta] = {
                    'total': total_tarjeta,
                    'pendiente': pendiente_tarjeta,
                    'pagado': pagado_tarjeta,
                    'total_display': format_cop(total_tarjeta),
                    'pendiente_display': format_cop(pendiente_tarjeta),
                    'pagado_display': format_cop(pagado_tarjeta),
                    'transacciones_count': len(tarjeta_data)
                }
        
        return render_template('tarjetas.html', 
                             transacciones=transacciones, 
                             total_pendiente=total_pendiente,
                             total_pagado=total_pagado,
                             resumen_tarjetas=resumen_tarjetas,
                             user=session['user_data'])
    except Exception as e:
        flash(f'Error cargando datos de tarjetas: {str(e)}', 'error')
        return render_template('tarjetas.html', 
                             transacciones=[], 
                             total_pendiente=0, 
                             total_pagado=0, 
                             resumen_tarjetas={},
                             user=session['user_data'])

@app.route('/add_credit_transaction', methods=['POST'])
def add_credit_transaction():
    """Añade una nueva transacción de crédito"""
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    try:
        finance_manager = FinanceManager(session['user_data'])
        fecha = request.form.get('fecha')
        descripcion = request.form.get('descripcion')
        monto = float(request.form.get('monto'))
        tarjeta = request.form.get('tarjeta')
        estado = request.form.get('estado', 'Pendiente')
        
        if finance_manager.add_credito_transaction(fecha, descripcion, monto, tarjeta, estado):
            flash('Gasto de tarjeta añadido exitosamente', 'success')
        else:
            flash('Error añadiendo gasto de tarjeta', 'error')
    except Exception as e:
        flash(f'Error: {str(e)}', 'error')
    
    return redirect(url_for('tarjetas'))

@app.route('/edit_credit_transaction', methods=['POST'])
def edit_credit_transaction():
    """Edita una transacción de crédito existente"""
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    try:
        finance_manager = FinanceManager(session['user_data'])
        index = int(request.form.get('index'))
        fecha = request.form.get('fecha')
        descripcion = request.form.get('descripcion')
        monto = float(request.form.get('monto'))
        tarjeta = request.form.get('tarjeta')
        estado = request.form.get('estado')
        
        if finance_manager.edit_credito_transaction(index, fecha, descripcion, monto, tarjeta, estado):
            flash('Gasto de tarjeta actualizado exitosamente', 'success')
        else:
            flash('Error actualizando gasto de tarjeta', 'error')
    except Exception as e:
        flash(f'Error: {str(e)}', 'error')
    
    return redirect(url_for('tarjetas'))

@app.route('/delete_credit_transaction', methods=['POST'])
def delete_credit_transaction():
    """Elimina una transacción de crédito"""
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    try:
        finance_manager = FinanceManager(session['user_data'])
        index = int(request.form.get('index'))
        
        if finance_manager.delete_credito_transaction(index):
            flash('Gasto de tarjeta eliminado exitosamente', 'success')
        else:
            flash('Error eliminando gasto de tarjeta', 'error')
    except Exception as e:
        flash(f'Error: {str(e)}', 'error')
    
    return redirect(url_for('tarjetas'))

@app.route('/graficas')
def graficas():
    """Página de gráficas y análisis"""
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    try:
        finance_manager = FinanceManager(session['user_data'])
        debito_df = finance_manager.get_debito_data()
        
        # Preparar datos para las gráficas
        data = {
            'balance_total': 0,
            'ingresos': 0,
            'gastos': 0,
            'gastos_por_mes': {},
            'balance_mensual': {},
            'gastos_por_categoria': {
                'labels': [],
                'values': []
            }
        }
        
        # Calcular totales
        if not debito_df.empty and 'Monto' in debito_df.columns:
            data['balance_total'] = float(debito_df['Monto'].sum())
            data['ingresos'] = float(debito_df[debito_df['Monto'] > 0]['Monto'].sum())
            data['gastos'] = float(abs(debito_df[debito_df['Monto'] < 0]['Monto'].sum()))
            
            # Convertir fechas para análisis mensual con formato correcto
            debito_df['Fecha'] = pd.to_datetime(debito_df['Fecha'], format='%d/%m/%Y', errors='coerce')
            if debito_df['Fecha'].isna().all():
                debito_df['Fecha'] = pd.to_datetime(debito_df['Fecha'], errors='coerce', dayfirst=True)
            debito_df['Mes'] = debito_df['Fecha'].dt.strftime('%Y-%m')
            
            # Gastos mensuales (valores negativos)
            gastos_mensuales = debito_df[debito_df['Monto'] < 0].groupby('Mes')['Monto'].sum().abs()
            # Ingresos mensuales (valores positivos)
            ingresos_mensuales = debito_df[debito_df['Monto'] > 0].groupby('Mes')['Monto'].sum()
            
            # Ordenar por mes
            gastos_mensuales = gastos_mensuales.sort_index()
            ingresos_mensuales = ingresos_mensuales.sort_index()
            
            # Formatear para las gráficas
            data['gastos_por_mes'] = {
                'labels': gastos_mensuales.index.tolist(),
                'values': gastos_mensuales.values.tolist()
            }
            
            data['balance_mensual'] = {
                'labels': ingresos_mensuales.index.tolist(),
                'values': ingresos_mensuales.values.tolist()
            }

            # Calcular gastos por categoría si existe la columna
            if 'Categoría' in debito_df.columns:
                gastos_df = debito_df[debito_df['Monto'] < 0].copy()
                if not gastos_df.empty:
                    categoria_gastos = gastos_df.groupby('Categoría')['Monto'].sum().abs()
                    data['gastos_por_categoria'] = {
                        'labels': categoria_gastos.index.tolist(),
                        'values': categoria_gastos.values.tolist()
                    }
        
        return render_template('graficas.html', data=data, user=session['user_data'])
    except Exception as e:
        print(f"Error cargando gráficas: {e}")
        flash('Error cargando gráficas. Por favor intente de nuevo.', 'error')
        return render_template('graficas.html', data={
            'balance_total': 0,
            'ingresos': 0,
            'gastos': 0,
            'gastos_por_mes': {},
            'balance_mensual': {},
            'gastos_por_categoria': {
                'labels': [],
                'values': []
            }
        }, user=session['user_data'])

@app.route('/analisis')
def analisis():
    """Dashboard de análisis financiero avanzado"""
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    try:
        finance_manager = FinanceManager(session['user_data'])
        debito_df = finance_manager.get_debito_data()
        credito_df = finance_manager.get_credito_data()
        
        # Análisis avanzado de datos
        analysis_data = perform_advanced_analysis(debito_df, credito_df)
        
        # Generar recomendaciones con IA
        recommendations = generate_ai_recommendations(analysis_data, debito_df, credito_df)
        
        return render_template('analisis.html', 
                             analysis=analysis_data, 
                             recommendations=recommendations,
                             user=session['user_data'])
    
    except Exception as e:
        print(f"Error en análisis: {e}")
        flash('Error cargando análisis. Por favor intente de nuevo.', 'error')
        return render_template('analisis.html', 
                             analysis={}, 
                             recommendations="",
                             user=session['user_data'])

def perform_advanced_analysis(debito_df, credito_df):
    """Realiza análisis avanzado de datos financieros"""
    import numpy as np
    from sklearn.linear_model import LinearRegression
    from sklearn.preprocessing import PolynomialFeatures
    from datetime import datetime, timedelta
    import json
    
    analysis = {
        'tendencias': {},
        'forecasting': {},
        'patrones': {},
        'metricas_avanzadas': {},
        'graficas': {}
    }
    
    if debito_df.empty:
        return analysis
    
    # Preparar datos - asegurar formato correcto de fechas
    # Intentar diferentes formatos de fecha comunes
    debito_df['Fecha'] = pd.to_datetime(debito_df['Fecha'], format='%d/%m/%Y', errors='coerce')
    if debito_df['Fecha'].isna().all():
        # Si falla, intentar formato americano
        debito_df['Fecha'] = pd.to_datetime(debito_df['Fecha'], format='%m/%d/%Y', errors='coerce')
    if debito_df['Fecha'].isna().all():
        # Si falla, usar inferencia automática
        debito_df['Fecha'] = pd.to_datetime(debito_df['Fecha'], errors='coerce', dayfirst=True)
    
    debito_df = debito_df.dropna(subset=['Fecha'])
    
    if len(debito_df) < 2:
        return analysis
    
    # 1. ANÁLISIS DE TENDENCIAS
    debito_df['Mes'] = debito_df['Fecha'].dt.to_period('M')
    monthly_data = debito_df.groupby('Mes').agg({
        'Monto': ['sum', 'count', 'mean']
    }).round(2)
    
    gastos_mensuales = debito_df[debito_df['Monto'] < 0].groupby('Mes')['Monto'].sum().abs()
    ingresos_mensuales = debito_df[debito_df['Monto'] > 0].groupby('Mes')['Monto'].sum()
    
    # 2. FORECASTING (Predicción próximos 3 meses)
    if len(gastos_mensuales) >= 3:
        try:
            # Preparar datos para regresión
            X = np.arange(len(gastos_mensuales)).reshape(-1, 1)
            y = gastos_mensuales.values
            
            # Modelo de regresión lineal
            model = LinearRegression()
            model.fit(X, y)
            
            # Predicciones para próximos 3 meses
            future_months = np.arange(len(gastos_mensuales), len(gastos_mensuales) + 3).reshape(-1, 1)
            predictions = model.predict(future_months)
            
            # Fechas futuras
            last_month = gastos_mensuales.index[-1]
            future_dates = []
            for i in range(1, 4):
                future_date = last_month + i
                future_dates.append(str(future_date))
            
            analysis['forecasting'] = {
                'gastos_predichos': [max(0, pred) for pred in predictions],
                'fechas_futuras': future_dates,
                'tendencia': 'creciente' if model.coef_[0] > 0 else 'decreciente',
                'pendiente': float(model.coef_[0])
            }
        except:
            analysis['forecasting'] = {}
    
    # 3. ANÁLISIS POR CATEGORÍAS
    if 'Categoría' in debito_df.columns:
        categoria_stats = debito_df.groupby('Categoría').agg({
            'Monto': ['sum', 'mean', 'count', 'std']
        }).round(2)
        
        # Top categorías de gastos
        gastos_categoria = debito_df[debito_df['Monto'] < 0].groupby('Categoría')['Monto'].sum().abs()
        top_gastos = gastos_categoria.nlargest(5)
        
        analysis['patrones'] = {
            'top_categorias_gasto': {
                'labels': top_gastos.index.tolist(),
                'values': top_gastos.values.tolist()
            },
            'variabilidad_por_categoria': {}
        }
        
        # Variabilidad por categoría
        for categoria in gastos_categoria.index:
            cat_data = debito_df[debito_df['Categoría'] == categoria]['Monto']
            if len(cat_data) > 1:
                analysis['patrones']['variabilidad_por_categoria'][categoria] = {
                    'std': float(cat_data.std()),
                    'cv': float(cat_data.std() / abs(cat_data.mean())) if cat_data.mean() != 0 else 0
                }
    
    # 4. MÉTRICAS AVANZADAS
    total_gastos = abs(debito_df[debito_df['Monto'] < 0]['Monto'].sum())
    total_ingresos = debito_df[debito_df['Monto'] > 0]['Monto'].sum()
    
    analysis['metricas_avanzadas'] = {
        'tasa_ahorro': float((total_ingresos - total_gastos) / total_ingresos * 100) if total_ingresos > 0 else 0,
        'gasto_promedio_diario': float(total_gastos / max(1, (debito_df['Fecha'].max() - debito_df['Fecha'].min()).days)),
        'frecuencia_transacciones': len(debito_df),
        'ticket_promedio': float(abs(debito_df[debito_df['Monto'] < 0]['Monto'].mean())) if len(debito_df[debito_df['Monto'] < 0]) > 0 else 0
    }
    
    # 5. DATOS PARA GRÁFICAS
    analysis['graficas'] = {
        'gastos_mensuales': {
            'labels': [str(m) for m in gastos_mensuales.index],
            'values': gastos_mensuales.values.tolist()
        },
        'ingresos_mensuales': {
            'labels': [str(m) for m in ingresos_mensuales.index],
            'values': ingresos_mensuales.values.tolist()
        }
    }
    
    # 6. GRÁFICA DE LÍNEAS SUAVIZADA - ÚLTIMOS 2 MESES
    try:
        # Debug: mostrar formato de fechas original
        if not debito_df.empty and 'Fecha' in debito_df.columns:
            print(f"[DEBUG] Primeras 3 fechas originales: {debito_df['Fecha'].head(3).tolist()}")
            print(f"[DEBUG] Tipos de fecha: {debito_df['Fecha'].dtype}")
        
        # Filtrar datos de los últimos 2 meses
        today = datetime.now()
        two_months_ago = today - timedelta(days=60)
        
        # Filtrar DataFrame por fechas
        recent_data = debito_df[debito_df['Fecha'] >= two_months_ago].copy()
        
        if not recent_data.empty:
            # Agrupar por día
            recent_data['Fecha_Dia'] = recent_data['Fecha'].dt.date
            daily_transactions = recent_data.groupby('Fecha_Dia').agg({
                'Monto': lambda x: [x[x > 0].sum() if len(x[x > 0]) > 0 else 0, 
                                   abs(x[x < 0].sum()) if len(x[x < 0]) > 0 else 0]
            })
            
            # Separar ingresos y gastos diarios
            dates = []
            ingresos_diarios = []
            gastos_diarios = []
            
            # Ordenar por fecha para asegurar orden cronológico
            daily_transactions_sorted = daily_transactions.sort_index()
            
            for fecha, values in daily_transactions_sorted.iterrows():
                # Asegurar formato correcto: día/mes/año
                fecha_formateada = fecha.strftime('%d/%m/%Y')
                dates.append(fecha_formateada)
                
                # Calcular ingresos y gastos del día
                ingresos_del_dia = recent_data[(recent_data['Fecha_Dia'] == fecha) & (recent_data['Monto'] > 0)]['Monto'].sum()
                gastos_del_dia = abs(recent_data[(recent_data['Fecha_Dia'] == fecha) & (recent_data['Monto'] < 0)]['Monto'].sum())
                
                ingresos_diarios.append(float(ingresos_del_dia))
                gastos_diarios.append(float(gastos_del_dia))
                
            print(f"[DEBUG] Fechas procesadas: {dates[:5]}...")  # Mostrar primeras 5 fechas
            
            analysis['grafica_lineas_2meses'] = {
                'fechas': dates,
                'ingresos': ingresos_diarios,
                'gastos': gastos_diarios,
                'total_dias': len(dates)
            }
        else:
            analysis['grafica_lineas_2meses'] = {
                'fechas': [],
                'ingresos': [],
                'gastos': [],
                'total_dias': 0
            }
    except Exception as e:
        print(f"Error generando gráfica de líneas 2 meses: {e}")
        analysis['grafica_lineas_2meses'] = {
            'fechas': [],
            'ingresos': [],
            'gastos': [],
            'total_dias': 0
        }
    
    # 6. DATOS PARA GRÁFICA DE VELAS (CANDLESTICK)
    try:
        # Agrupar por día para crear datos de velas
        debito_df['Fecha_Solo'] = debito_df['Fecha'].dt.date
        daily_data = debito_df.groupby('Fecha_Solo').agg({
            'Monto': ['sum', 'min', 'max', 'count']
        }).round(2)
        
        if len(daily_data) > 0:
            # Calcular balance acumulado para simular precio de "cierre"
            daily_balance = debito_df.groupby('Fecha_Solo')['Monto'].sum()
            cumulative_balance = daily_balance.cumsum()
            
            # Crear datos de velas
            dates = []
            opens = []
            highs = []
            lows = []
            closes = []
            
            prev_close = 0
            for date, balance in daily_balance.items():
                dates.append(date.strftime('%Y-%m-%d'))
                
                # Open: balance del día anterior
                opens.append(prev_close)
                
                # Close: balance acumulado del día
                current_close = prev_close + balance
                closes.append(current_close)
                
                # High y Low basados en transacciones del día
                day_transactions = debito_df[debito_df['Fecha_Solo'] == date]['Monto']
                if len(day_transactions) > 0:
                    # High: el punto más alto durante el día
                    highs.append(max(prev_close, current_close, prev_close + day_transactions.max()))
                    # Low: el punto más bajo durante el día  
                    lows.append(min(prev_close, current_close, prev_close + day_transactions.min()))
                else:
                    highs.append(max(prev_close, current_close))
                    lows.append(min(prev_close, current_close))
                
                prev_close = current_close
            
            analysis['candlestick_data'] = {
                'dates': dates,
                'open': opens,
                'high': highs,
                'low': lows,
                'close': closes
            }
        else:
            analysis['candlestick_data'] = {}
            
    except Exception as e:
        print(f"Error generando datos de candlestick: {e}")
        analysis['candlestick_data'] = {}
    
    return analysis

def generate_ai_recommendations(analysis_data, debito_df, credito_df):
    """Genera recomendaciones usando IA"""
    if not AI_ENABLED:
        return "Recomendaciones IA no disponibles. Configura GEMINI_API_KEY en .env"
    
    try:
        # Preparar contexto para IA
        context = f"""
        Eres un analista financiero experto. Analiza estos datos y proporciona recomendaciones CONCISAS y ACCIONABLES.
        
        DATOS FINANCIEROS:
        - Tasa de ahorro: {analysis_data.get('metricas_avanzadas', {}).get('tasa_ahorro', 0):.1f}%
        - Gasto promedio diario: ${analysis_data.get('metricas_avanzadas', {}).get('gasto_promedio_diario', 0):,.0f} COP
        - Ticket promedio: ${analysis_data.get('metricas_avanzadas', {}).get('ticket_promedio', 0):,.0f} COP
        
        TENDENCIA DE GASTOS: {analysis_data.get('forecasting', {}).get('tendencia', 'sin datos')}
        
        TOP CATEGORÍAS DE GASTO:
        {analysis_data.get('patrones', {}).get('top_categorias_gasto', {}).get('labels', [])}
        
        INSTRUCCIONES:
        1. Máximo 5 recomendaciones
        2. Cada recomendación en 1-2 líneas
        3. Enfócate en acciones específicas
        4. Usa formato de lista con viñetas
        5. Menciona números específicos cuando sea relevante
        
        Proporciona recomendaciones financieras:
        """
        
        response = model.generate_content(context)
        return response.text
        
    except Exception as e:
        return f"Error generando recomendaciones: {str(e)}"

if __name__ == '__main__':
    # Configuración para producción (Render) y desarrollo
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') == 'development'
    
    app.run(host='0.0.0.0', port=port, debug=debug) 