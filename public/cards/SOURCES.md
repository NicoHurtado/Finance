# Imágenes de tarjetas

Consultadas el 6 de septiembre de 2026. Los diseños y marcas pertenecen a sus emisores.
Los archivos finales usan las imágenes de las fuentes oficiales, no ilustraciones generadas.

| Archivo | Fuente oficial | Preparación y resolución |
| --- | --- | --- |
| nu-credit.png | [Nu Colombia: Apple Pay](https://nu.com.co/credito/) — [imagen](https://nu.com.co/_next/static/images/6b6588cbfc9b58179100654f86aa649b-apple-pay.png) | Recorte de la tarjeta de Apple Wallet (502 × 314), ampliado a 1600 × 1000. Se quitaron los últimos dígitos de ejemplo copiando un pequeño fragmento del fondo contiguo; logos originales. Es la versión Wallet, sin chip visible. |
| bancolombia-debito.png | [Bancolombia: débito](https://www.bancolombia.com/personas/tarjetas-debito) — [imagen](https://www.bancolombia.com/wcm/connect/www.bancolombia.com-26918/dc12de69-2f4b-47f1-8ec0-358c564d1627/004_600x379.png?MOD=AJPERES&CACHEID=ROOTWORKSPACE.Z18_9O44G4S049MAD06H7SNS78IMS1-dc12de69-2f4b-47f1-8ec0-358c564d1627-pesnRB.) | PNG oficial amarillo, 600 × 379, sin modificación. |
| bancolombia-visa-platinum.webp | [Bancolombia: Visa](https://www.bancolombia.com/personas/productos/tarjetas-credito/visa) — [imagen](https://media.ffycdn.net/us/grupo-bancolombia-arquitectura-y-contenidos/siuor8xFXTDyNaeaZBeq.webp) | WEBP oficial, 3075 × 1924, sin modificación. |
| bancolombia-amex-gold.webp | [Bancolombia: American Express Gold](https://www.bancolombia.com/personas/productos/tarjetas-credito/american-express/gold) — [imagen](https://media.ffycdn.net/us/grupo-bancolombia-arquitectura-y-contenidos/aTXwcmr1X2Jv5cu8yNvJ.webp) | WEBP oficial, 3075 × 1920, sin modificación (consultada el 5 de noviembre de 2026). |
| rappicard.png | [RappiCard Colombia](https://www.rappicard.co/) — [imagen](https://www.origin.rappicard.co/wp-content/uploads/2025/08/rappicard-tarjeta-credito.png) | Frente de la primera tarjeta, aislado mediante homografía y girado a horizontal. Salida 1600 × 1000; detalle limitado por la foto original de 1000 × 1000. |
| arq.png | [ARQ](https://www.arqfinance.com/es-CO) — [imagen](https://www.arqfinance.com/_astro/benefit-1-en-all.DXNm6J_1_1EP5q.webp) | Variante metálica clara de la foto oficial, aislada mediante homografía. Salida 1600 × 1000; detalle limitado por la foto original de 1232 × 704. No confirma la variante particular del usuario. |

Los originales de Nu, RappiCard y ARQ están en `originals/`. El recorte conserva textura, marcas y chip de las fotos; la ampliación no añade detalle. No se usan los resultados generativos probados durante la preparación.

La imagen está separada del nombre, los últimos dígitos y el saldo/deuda. Esos datos son HTML encima de la foto, fuera de sus límites. Las miniaturas no agregan logos ni velos sobre las fotos. La app conserva la proporción natural del frente completo.

`app/` contiene copias WebP optimizadas (hasta 960 px) para la aplicación. Los archivos grandes de esta carpeta se conservan para descargar.

## Actualización: ARQ verde y proporciones

`arq-green.png` es la imagen ARQ Global verde adjuntada por el usuario. Se conserva intacta; `app/arq-green.webp` es una conversión sin pérdida. Sustituye la variante metálica como diseño activo.

Las tarjetas muestran título, tipo (Crédito/Débito), últimos dígitos y valor encima de la foto. La foto usa ancho adaptable y altura natural, sin superposiciones. Las miniaturas usan `object-contain`.
