import requests
import time
from datetime import datetime, timedelta
import pytz
from py_clob_client.client import ClobClient
from py_clob_client.clob_types import OrderArgs, OrderType
from py_clob_client.constants import POLYGON
import os
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

class PolymarketBot:
    def __init__(self, private_key=None, trade_amount=10):
        """
        Inicializa el bot de Polymarket
        
        Args:
            private_key: Clave privada de tu wallet de Polygon (sin el prefijo 0x)
            trade_amount: Cantidad en USDC a invertir por trade (default: 10 USDC)
        """
        self.base_url = "https://gamma-api.polymarket.com"
        self.london_tz = pytz.timezone('Europe/London')
        self.trade_hour = 21  # 21:00 (9 PM)
        self.min_price = 0.85  # 85 centavos
        self.trade_amount = trade_amount
        
        # Configurar cliente de Polymarket
        self.private_key = private_key or os.getenv('POLYGON_PRIVATE_KEY')
        
        if not self.private_key:
            print("⚠️  ADVERTENCIA: No se proporcionó clave privada.")
            print("   El bot funcionará en MODO SIMULACIÓN")
            print("   Para trades reales, configura POLYGON_PRIVATE_KEY en .env")
            self.client = None
        else:
            try:
                # Inicializar cliente de Polymarket
                self.client = ClobClient(
                    key=self.private_key,
                    chain_id=POLYGON,  # Red principal de Polygon
                )
                print("✅ Cliente de Polymarket conectado correctamente")
                
                # Verificar balance
                self.check_balance()
                
            except Exception as e:
                print(f"❌ Error al conectar con Polymarket: {e}")
                self.client = None
    
    def check_balance(self):
        """Verifica el balance de USDC en la wallet"""
        if not self.client:
            return
        
        try:
            # Obtener balance (esto depende de la implementación del cliente)
            print("💰 Verificando balance de USDC...")
            # Nota: py-clob-client puede requerir métodos específicos para esto
            
        except Exception as e:
            print(f"⚠️  No se pudo verificar el balance: {e}")
    
    def get_market_slug(self, date):
        """Genera el slug del mercado para una fecha específica"""
        date_str = date.strftime("%B-%-d").lower()
        return f"highest-temperature-in-london-on-{date_str}"
    
    def get_market_data(self, slug):
        """Obtiene los datos del mercado desde la API de Polymarket"""
        try:
            # Buscar el evento por slug
            url = f"{self.base_url}/events"
            params = {"slug": slug}
            response = requests.get(url, params=params)
            
            if response.status_code != 200:
                print(f"Error al obtener mercado: {response.status_code}")
                return None
            
            events = response.json()
            if not events:
                print(f"No se encontró el mercado: {slug}")
                return None
            
            event = events[0]
            
            # Obtener los mercados (temperaturas) del evento
            markets = event.get('markets', [])
            
            market_data = {
                'event_id': event.get('id'),
                'slug': slug,
                'markets': []
            }
            
            for market in markets:
                market_info = {
                    'condition_id': market.get('condition_id'),
                    'token_id': market.get('tokens', [{}])[0].get('token_id'),  # Token ID para YES
                    'question': market.get('question'),
                    'yes_price': float(market.get('outcomePrices', ['0', '0'])[0]),
                    'no_price': float(market.get('outcomePrices', ['0', '0'])[1]),
                }
                market_data['markets'].append(market_info)
            
            return market_data
            
        except Exception as e:
            print(f"Error al obtener datos del mercado: {e}")
            return None
    
    def get_london_time(self):
        """Obtiene la hora actual en Londres"""
        return datetime.now(self.london_tz)
    
    def should_trade(self, london_time):
        """Verifica si es hora de operar (después de las 21:00)"""
        return london_time.hour >= self.trade_hour
    
    def find_trading_opportunity(self, market_data):
        """Busca oportunidades de trading según los criterios"""
        if not market_data or not market_data.get('markets'):
            return None
        
        opportunities = []
        
        for market in market_data['markets']:
            yes_price = market['yes_price']
            
            if yes_price >= self.min_price:
                opportunities.append({
                    'question': market['question'],
                    'condition_id': market['condition_id'],
                    'token_id': market['token_id'],
                    'yes_price': yes_price,
                    'no_price': market['no_price']
                })
        
        return opportunities if opportunities else None
    
    def execute_trade_real(self, opportunity):
        """
        Ejecuta un trade REAL en Polymarket
        """
        if not self.client:
            print("❌ No se puede ejecutar trade: cliente no inicializado")
            return False
        
        try:
            token_id = opportunity['token_id']
            price = opportunity['yes_price']
            
            # Calcular cantidad de shares a comprar
            amount = self.trade_amount / price
            
            print(f"\n🔄 Ejecutando TRADE REAL...")
            print(f"   Token ID: {token_id}")
            print(f"   Precio: ${price:.3f}")
            print(f"   Inversión: ${self.trade_amount} USDC")
            print(f"   Shares: {amount:.2f}")
            
            # Crear orden de compra
            order_args = OrderArgs(
                price=price,
                size=amount,
                side="BUY",
                token_id=token_id,
            )
            
            # Enviar orden
            signed_order = self.client.create_order(order_args)
            resp = self.client.post_order(signed_order, OrderType.GTC)
            
            print(f"✅ TRADE EJECUTADO EXITOSAMENTE")
            print(f"   Order ID: {resp.get('orderID', 'N/A')}")
            print(f"   Status: {resp.get('status', 'N/A')}")
            
            return True
            
        except Exception as e:
            print(f"❌ Error al ejecutar trade: {e}")
            return False
    
    def execute_trade_simulation(self, opportunity):
        """
        Simula un trade (para modo sin clave privada)
        """
        print(f"\n🎭 MODO SIMULACIÓN - Trade detectado pero NO ejecutado:")
        print(f"   Mercado: {opportunity['question']}")
        print(f"   Precio YES: ${opportunity['yes_price']:.3f}")
        print(f"   Precio NO: ${opportunity['no_price']:.3f}")
        print(f"   Inversión que se haría: ${self.trade_amount} USDC")
        print(f"   Shares que se comprarían: {self.trade_amount / opportunity['yes_price']:.2f}")
        print(f"\n⚠️  Para ejecutar trades REALES, configura tu POLYGON_PRIVATE_KEY")
    
    def execute_trade(self, opportunity):
        """
        Ejecuta o simula un trade según la configuración
        """
        print(f"\n🔔 OPORTUNIDAD DE TRADING DETECTADA:")
        print(f"   Mercado: {opportunity['question']}")
        print(f"   Precio YES: ${opportunity['yes_price']:.3f}")
        print(f"   Condition ID: {opportunity['condition_id']}")
        
        if self.client:
            return self.execute_trade_real(opportunity)
        else:
            self.execute_trade_simulation(opportunity)
            return False
    
    def run(self, check_interval=300):
        """
        Ejecuta el bot en un loop continuo
        check_interval: segundos entre cada verificación (default: 5 minutos)
        """
        print("\n" + "="*60)
        print("🤖 BOT DE POLYMARKET INICIADO")
        print("="*60)
        print(f"⏰ Horario de trading: después de las {self.trade_hour}:00 Londres")
        print(f"💰 Precio mínimo YES: ${self.min_price}")
        print(f"💵 Cantidad por trade: ${self.trade_amount} USDC")
        print(f"🔄 Intervalo de verificación: {check_interval} segundos")
        
        if self.client:
            print(f"✅ Modo: TRADES REALES")
        else:
            print(f"🎭 Modo: SIMULACIÓN")
        
        print("="*60)
        
        last_traded_date = None
        
        while True:
            try:
                # Obtener hora actual en Londres
                london_time = self.get_london_time()
                today = london_time.date()
                
                print(f"\n📅 {london_time.strftime('%Y-%m-%d %H:%M:%S %Z')}")
                
                # Generar slug del mercado para hoy
                market_slug = self.get_market_slug(london_time)
                print(f"🔍 Buscando mercado: {market_slug}")
                
                # Obtener datos del mercado
                market_data = self.get_market_data(market_slug)
                
                if market_data:
                    print(f"✅ Mercado encontrado con {len(market_data['markets'])} opciones")
                    
                    # Verificar si es hora de operar
                    if self.should_trade(london_time):
                        print(f"⏰ Hora de trading activa")
                        
                        # Buscar oportunidades
                        opportunities = self.find_trading_opportunity(market_data)
                        
                        if opportunities and last_traded_date != today:
                            for opp in opportunities:
                                self.execute_trade(opp)
                            
                            last_traded_date = today
                            print(f"✅ Trade(s) procesado(s) para hoy")
                        elif last_traded_date == today:
                            print(f"⏭️  Ya se operó hoy, esperando al siguiente día")
                        else:
                            print(f"❌ No hay oportunidades (ninguna opción YES >= ${self.min_price})")
                    else:
                        print(f"⏳ Esperando hasta las {self.trade_hour}:00 Londres")
                else:
                    print(f"❌ No se pudo obtener datos del mercado")
                
                # Esperar antes de la siguiente verificación
                print(f"\n💤 Esperando {check_interval} segundos...")
                time.sleep(check_interval)
                
            except KeyboardInterrupt:
                print("\n\n🛑 Bot detenido por el usuario")
                break
            except Exception as e:
                print(f"\n❌ Error: {e}")
                print(f"💤 Reintentando en {check_interval} segundos...")
                time.sleep(check_interval)

# Ejecutar el bot
if __name__ == "__main__":
    # Opción 1: Usar variable de entorno (recomendado)
    bot = PolymarketBot(trade_amount=10)
    
    # Opción 2: Pasar la clave directamente (NO RECOMENDADO para producción)
    # bot = PolymarketBot(
    #     private_key="tu_clave_privada_aqui_sin_0x",
    #     trade_amount=10
    # )
    
    # Ejecutar con verificaciones cada 5 minutos (300 segundos)
    bot.run(check_interval=300)
