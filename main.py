from fastapi import FastAPI, Body
from fastapi.responses import Response
import pandas as pd
import io
import re
from datetime import datetime

app = FastAPI()

def add_excel_table(worksheet, df, table_name):
    if df.empty:
        return
    (max_row, max_col) = df.shape
    # Sanitize table name: must start with letter/underscore, only alphanumeric and underscores
    sanitized_name = re.sub(r'[^a-zA-Z0-9_]', '_', table_name)
    if not sanitized_name[0].isalpha() and sanitized_name[0] != '_':
        sanitized_name = 'T_' + sanitized_name
    
    column_settings = [{'header': str(column)} for column in df.columns]
    worksheet.add_table(0, 0, max_row, max_col - 1, {'columns': column_settings, 'name': sanitized_name, 'style': 'Table Style Medium 9'})
    worksheet.set_column(0, max_col - 1, 20)

def add_historial_sheet(writer, historial_data, selected_sucursal):
    if not historial_data:
        return
    
    df_h = pd.DataFrame(historial_data)
    if df_h.empty:
        return
        
    if selected_sucursal != "General":
        if 'sucursal' in df_h.columns:
            df_h = df_h[df_h['sucursal'] == selected_sucursal]
    
    if df_h.empty:
        return

    for col in ['piezasTotal', 'costoTotal']:
        if col in df_h.columns:
            df_h[col] = pd.to_numeric(df_h[col], errors='coerce').fillna(0)

    def get_month_year(date_str):
        if not date_str or pd.isna(date_str):
            return "Unknown"
        parts = str(date_str).split("-")
        if len(parts) >= 3:
            return f"{parts[1]}-{parts[2]}"
        return "Unknown"

    df_h['monthYear'] = df_h['fecha'].apply(get_month_year)
    df_h = df_h[df_h['monthYear'] != "Unknown"]
    
    if df_h.empty:
        return

    monthly_stats = df_h.groupby('monthYear').agg(
        piezas=('piezasTotal', 'sum'),
        rutas=('hojaRuta', 'nunique'),
        costo=('costoTotal', 'sum')
    ).reset_index()
    
    def sort_key(my):
        try:
            m, y = map(int, my.split("-"))
            return y * 100 + m
        except:
            return 0
    
    monthly_stats['sort_key'] = monthly_stats['monthYear'].apply(sort_key)
    monthly_stats = monthly_stats.sort_values('sort_key').drop(columns=['sort_key'])
    
    transposed = pd.DataFrame({
        'Indicador': ['Piezas Totales', 'Rutas Totales', 'Costos Totales']
    })
    
    for _, row in monthly_stats.iterrows():
        transposed[row['monthYear']] = [row['piezas'], row['rutas'], row['costo']]
        
    sheet_name = 'Histórico'
    transposed.to_excel(writer, sheet_name=sheet_name, index=False)
    ws = writer.sheets[sheet_name]
    add_excel_table(ws, transposed, 'TablaHistorico')

def add_historial_sheet_for_consolidated(writer, historial_data, sheet_name):
    if not historial_data:
        return
    
    df_h = pd.DataFrame(historial_data)
    if df_h.empty:
        return

    for col in ['piezasTotal', 'costoTotal']:
        if col in df_h.columns:
            df_h[col] = pd.to_numeric(df_h[col], errors='coerce').fillna(0)

    def get_month_year(date_str):
        if not date_str or pd.isna(date_str):
            return "Unknown"
        parts = str(date_str).split("-")
        if len(parts) >= 3:
            return f"{parts[1]}-{parts[2]}"
        return "Unknown"

    df_h['monthYear'] = df_h['fecha'].apply(get_month_year)
    df_h = df_h[df_h['monthYear'] != "Unknown"]
    
    if df_h.empty:
        return

    monthly_stats = df_h.groupby('monthYear').agg(
        piezas=('piezasTotal', 'sum'),
        rutas=('hojaRuta', 'nunique'),
        costo=('costoTotal', 'sum')
    ).reset_index()
    
    def sort_key(my):
        try:
            m, y = map(int, my.split("-"))
            return y * 100 + m
        except:
            return 0
    
    monthly_stats['sort_key'] = monthly_stats['monthYear'].apply(sort_key)
    monthly_stats = monthly_stats.sort_values('sort_key').drop(columns=['sort_key'])
    
    transposed = pd.DataFrame({
        'Indicador': ['Piezas Totales', 'Rutas Totales', 'Costos Totales']
    })
    
    for _, row in monthly_stats.iterrows():
        transposed[row['monthYear']] = [row['piezas'], row['rutas'], row['costo']]
        
    transposed.to_excel(writer, sheet_name=sheet_name, index=False)
    ws = writer.sheets[sheet_name]
    add_excel_table(ws, transposed, f"Tabla_{sheet_name.replace(' ', '_')}")

@app.post("/api/export")
async def export_data(payload: dict = Body(...)):
    data = payload.get("data", [])
    historial_data = payload.get("historialData") or payload.get("historial", [])
    selected_sucursal = payload.get("selectedSucursal", "General")
    is_general = selected_sucursal == "General"

    df = pd.DataFrame(data)
    
    # Asegurar que las columnas numéricas sean tratadas como tal
    for col in ['piezasTotal', 'piezasEntregadas', 'piezasNoEntregadas', 'costoTotal']:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    output = io.BytesIO()
    writer = pd.ExcelWriter(output, engine='xlsxwriter')
    workbook = writer.book

    # 1. Distribuidores
    if is_general:
        if not df.empty:
            dist_df = df.groupby('sucursal', dropna=False, as_index=False).agg(
                distribuidores=('distribuidor', 'nunique'),
                rutas=('hojaRuta', 'nunique')
            )
            dist_df.rename(columns={'sucursal': 'Sucursal', 'distribuidores': 'Total Distribuidores', 'rutas': 'Cantidad de Rutas'}, inplace=True)
            dist_df.to_excel(writer, sheet_name='Distribuidores', index=False)
            ws = writer.sheets['Distribuidores']
            add_excel_table(ws, dist_df, 'TablaDistribuidores')
            
            chart = workbook.add_chart({'type': 'column'})
            max_row = len(dist_df)
            chart.add_series({
                'name': ['Distribuidores', 0, 2],
                'categories': ['Distribuidores', 1, 0, max_row, 0],
                'values': ['Distribuidores', 1, 2, max_row, 2],
                'data_labels': {'value': True}
            })
            chart.set_legend({'none': True})
            ws.insert_chart('E2', chart)
    else:
        if not df.empty:
            dist_df = df.groupby(['distribuidor', 'vehiculo'], dropna=False, as_index=False).agg(
                rutas=('hojaRuta', 'nunique'),
                entregadas=('piezasEntregadas', 'sum'),
                total=('piezasTotal', 'sum')
            )
            dist_df['eficiencia'] = (dist_df['entregadas'] / dist_df['total'] * 100).fillna(0).round().astype(int)
            dist_df = dist_df[['distribuidor', 'vehiculo', 'rutas', 'eficiencia']]
            dist_df.rename(columns={'distribuidor': 'Distribuidor', 'vehiculo': 'Tipo de Vehículo', 'rutas': 'Total Rutas', 'eficiencia': 'Eficiencia (%)'}, inplace=True)
            dist_df.to_excel(writer, sheet_name='Distribuidores', index=False)
            ws = writer.sheets['Distribuidores']
            add_excel_table(ws, dist_df, 'TablaDistribuidores')
            
            chart = workbook.add_chart({'type': 'column'})
            max_row = len(dist_df)
            chart.add_series({
                'name': ['Distribuidores', 0, 2],
                'categories': ['Distribuidores', 1, 0, max_row, 0],
                'values': ['Distribuidores', 1, 2, max_row, 2],
                'data_labels': {'value': True}
            })
            chart.set_legend({'none': True})
            ws.insert_chart('F2', chart)

    # 2. Costos
    if is_general:
        if not df.empty:
            costos_df = df.groupby('sucursal', dropna=False, as_index=False).agg(costo=('costoTotal', 'sum'))
            costos_df['costo'] = costos_df['costo'].round().astype(int)
            costos_df.rename(columns={'sucursal': 'Sucursal', 'costo': 'Costo Total'}, inplace=True)
            costos_df.to_excel(writer, sheet_name='Costos', index=False)
            ws = writer.sheets['Costos']
            add_excel_table(ws, costos_df, 'TablaCostos')
            
            chart = workbook.add_chart({'type': 'column'})
            max_row = len(costos_df)
            chart.add_series({
                'name': ['Costos', 0, 1],
                'categories': ['Costos', 1, 0, max_row, 0],
                'values': ['Costos', 1, 1, max_row, 1],
                'data_labels': {'value': True}
            })
            chart.set_legend({'none': True})
            ws.insert_chart('D2', chart)
    else:
        if not df.empty:
            costos_df = df.groupby('distribuidor', dropna=False, as_index=False).agg(costo=('costoTotal', 'sum'))
            costos_df['costo'] = costos_df['costo'].round().astype(int)
            costos_df.rename(columns={'distribuidor': 'Distribuidor', 'costo': 'Costo Total'}, inplace=True)
            costos_df.to_excel(writer, sheet_name='Costos', index=False)
            ws = writer.sheets['Costos']
            add_excel_table(ws, costos_df, 'TablaCostos')
            
            chart = workbook.add_chart({'type': 'bar'})
            max_row = len(costos_df)
            chart.add_series({
                'name': ['Costos', 0, 1],
                'categories': ['Costos', 1, 0, max_row, 0],
                'values': ['Costos', 1, 1, max_row, 1],
                'data_labels': {'value': True}
            })
            chart.set_y_axis({'reverse': True})
            chart.set_legend({'none': True})
            ws.insert_chart('D2', chart)

    # 3. Piezas
    if is_general:
        if not df.empty:
            sin_novedad = df[df['piezasNoEntregadas'] == 0].copy()
            if not sin_novedad.empty:
                sin_novedad['Efectividad (%)'] = (sin_novedad['piezasEntregadas'] / sin_novedad['piezasTotal'] * 100).fillna(0).round().astype(int)
                piezas_df = sin_novedad[['sucursal', 'distribuidor', 'fecha', 'piezasTotal', 'piezasEntregadas', 'piezasNoEntregadas', 'Efectividad (%)']]
                piezas_df.rename(columns={'sucursal': 'Sucursal', 'distribuidor': 'Distribuidor', 'fecha': 'Fecha', 'piezasTotal': 'Piezas Total', 'piezasEntregadas': 'Entregadas', 'piezasNoEntregadas': 'No Entregadas'}, inplace=True)
                piezas_df.to_excel(writer, sheet_name='Piezas', index=False)
                ws = writer.sheets['Piezas']
                add_excel_table(ws, piezas_df, 'TablaPiezas')
                
                chart = workbook.add_chart({'type': 'column'})
                max_row = len(piezas_df)
                chart.add_series({
                    'name': ['Piezas', 0, 3],
                    'categories': ['Piezas', 1, 0, max_row, 0],
                    'values': ['Piezas', 1, 3, max_row, 3],
                    'data_labels': {'value': True}
                })
                chart.set_legend({'none': True})
                ws.insert_chart('I2', chart)
    else:
        if not df.empty:
            sin_novedad = df[df['piezasNoEntregadas'] == 0].copy()
            if not sin_novedad.empty:
                sin_novedad['Efectividad (%)'] = (sin_novedad['piezasEntregadas'] / sin_novedad['piezasTotal'] * 100).fillna(0).round().astype(int)
                piezas_df = sin_novedad[['distribuidor', 'fecha', 'piezasTotal', 'piezasEntregadas', 'piezasNoEntregadas', 'Efectividad (%)']]
                piezas_df.rename(columns={'distribuidor': 'Distribuidor', 'fecha': 'Fecha', 'piezasTotal': 'Piezas Total', 'piezasEntregadas': 'Entregadas', 'piezasNoEntregadas': 'No Entregadas'}, inplace=True)
                piezas_df.to_excel(writer, sheet_name='Piezas', index=False)
                ws = writer.sheets['Piezas']
                add_excel_table(ws, piezas_df, 'TablaPiezas')
                
                chart = workbook.add_chart({'type': 'column'})
                max_row = len(piezas_df)
                chart.add_series({
                    'name': ['Piezas', 0, 2],
                    'categories': ['Piezas', 1, 0, max_row, 0],
                    'values': ['Piezas', 1, 2, max_row, 2],
                    'data_labels': {'value': True}
                })
                chart.set_legend({'none': True})
                ws.insert_chart('H2', chart)

    # 4. Fechas
    dias_espanol = {0: 'Lunes', 1: 'Martes', 2: 'Miércoles', 3: 'Jueves', 4: 'Viernes', 5: 'Sábado', 6: 'Domingo'}
    if is_general:
        if not df.empty:
            fechas_df = df.groupby('sucursal', dropna=False, as_index=False).agg(dias=('fecha', 'nunique'))
            fechas_df.rename(columns={'sucursal': 'Sucursal', 'dias': 'Días Operativos'}, inplace=True)
            total_dias = df['fecha'].nunique()
            
            chart_max_row = len(fechas_df)
            
            fechas_df.loc[len(fechas_df)] = ['TOTAL', total_dias]
            fechas_df.to_excel(writer, sheet_name='Fechas', index=False)
            ws = writer.sheets['Fechas']
            add_excel_table(ws, fechas_df, 'TablaFechas')
            
            if chart_max_row > 0:
                chart = workbook.add_chart({'type': 'column'})
                chart.add_series({
                    'name': ['Fechas', 0, 1],
                    'categories': ['Fechas', 1, 0, chart_max_row, 0],
                    'values': ['Fechas', 1, 1, chart_max_row, 1],
                    'data_labels': {'value': True}
                })
                chart.set_legend({'none': True})
                ws.insert_chart('D2', chart)
    else:
        if not df.empty:
            fechas_df = df.groupby('fecha', dropna=False, as_index=False).agg(rutas=('hojaRuta', 'nunique'))
            fechas_df['fecha_dt'] = pd.to_datetime(fechas_df['fecha'], errors='coerce')
            fechas_df['Día de la Semana'] = fechas_df['fecha_dt'].dt.dayofweek.map(dias_espanol).fillna('')
            fechas_df['Fecha'] = fechas_df['fecha_dt'].dt.strftime('%d-%b').fillna(fechas_df['fecha'])
            fechas_df = fechas_df[['Fecha', 'Día de la Semana', 'rutas']]
            fechas_df.rename(columns={'rutas': 'Cantidad de Rutas'}, inplace=True)
            fechas_df.to_excel(writer, sheet_name='Fechas', index=False)
            ws = writer.sheets['Fechas']
            add_excel_table(ws, fechas_df, 'TablaFechas')
            
            chart = workbook.add_chart({'type': 'column'})
            max_row = len(fechas_df)
            chart.add_series({
                'name': ['Fechas', 0, 2],
                'categories': ['Fechas', 1, 0, max_row, 0],
                'values': ['Fechas', 1, 2, max_row, 2],
                'data_labels': {'value': True}
            })
            chart.set_legend({'none': True})
            ws.insert_chart('E2', chart)

    # 5. Zonas
    if is_general:
        if not df.empty:
            zonas_df = df.pivot_table(index='sucursal', columns='zona', values='piezasTotal', aggfunc='sum', fill_value=0).reset_index()
            zonas_df.rename(columns={'sucursal': 'Sucursal'}, inplace=True)
            zonas_df.to_excel(writer, sheet_name='Zonas', index=False)
            ws = writer.sheets['Zonas']
            add_excel_table(ws, zonas_df, 'TablaZonas')
            
            chart = workbook.add_chart({'type': 'column'})
            max_row = len(zonas_df)
            for i, col in enumerate(zonas_df.columns[1:], start=1):
                chart.add_series({
                    'name': ['Zonas', 0, i],
                    'categories': ['Zonas', 1, 0, max_row, 0],
                    'values': ['Zonas', 1, i, max_row, i],
                    'data_labels': {'value': True}
                })
            chart.set_legend({'none': True})
            ws.insert_chart(1, len(zonas_df.columns) + 1, chart)
    else:
        if not df.empty:
            zonas_df = df.groupby('zona', dropna=False, as_index=False).agg(piezas=('piezasTotal', 'sum'))
            zonas_df.rename(columns={'zona': 'Zona', 'piezas': 'Total Piezas'}, inplace=True)
            zonas_df.to_excel(writer, sheet_name='Zonas', index=False)
            ws = writer.sheets['Zonas']
            add_excel_table(ws, zonas_df, 'TablaZonas')
            
            chart = workbook.add_chart({'type': 'column'})
            max_row = len(zonas_df)
            chart.add_series({
                'name': ['Zonas', 0, 1],
                'categories': ['Zonas', 1, 0, max_row, 0],
                'values': ['Zonas', 1, 1, max_row, 1],
                'data_labels': {'value': True}
            })
            chart.set_legend({'none': True})
            ws.insert_chart('D2', chart)
            
    # 6. Histórico
    add_historial_sheet(writer, historial_data, selected_sucursal)

    writer.close()
    output.seek(0)

    headers = {
        'Content-Disposition': f'attachment; filename="Analisis_Logistico_{selected_sucursal}_{datetime.now().strftime("%Y-%m-%d")}.xlsx"'
    }
    return Response(content=output.read(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)

@app.post("/api/export-consolidated")
async def export_consolidated(payload: dict = Body(...)):
    data = payload.get("data", [])
    historial_data = payload.get("historialData") or payload.get("historial", [])
    presupuestos = payload.get("presupuestos", {})
    filter_day = payload.get("filterDay")
    show_current_month = payload.get("showCurrentMonth", False)
    
    if not data:
        return Response(content="No data provided", status_code=400)
        
    df = pd.DataFrame(data)
    
    output = io.BytesIO()
    writer = pd.ExcelWriter(output, engine='xlsxwriter')
    workbook = writer.book
    
    # Group by sucursal to create separate sheets
    sucursales = df['sucursal'].unique()
    
    for suc in sucursales:
        suc_df = df[df['sucursal'] == suc].copy()
        # Ensure columns are in a consistent order for re-import
        cols = [
            'fecha', 'distribuidor', 'vehiculo', 'hojaRuta', 'ruta', 'retiros',
            'piezasTotal', 'bultosTotal', 'palets', 'peso', 'zona',
            'piezasEntregadas', 'piezasNoEntregadas', 'visitadasNovedad',
            'noVisitadas', 'bultosEntregados', 'bultosDevueltos', 'bultosNoEntregados', 'costoTotal',
            'presupuesto', 'observaciones', 'cliente'
        ]
        
        # Only keep columns that exist in the dataframe
        existing_cols = [c for c in cols if c in suc_df.columns]
        suc_df = suc_df[existing_cols]

        # Rename columns for a more professional look
        rename_dict = {
            'fecha': 'Fecha',
            'distribuidor': 'Distribuidor',
            'vehiculo': 'Vehículo',
            'hojaRuta': 'Hoja de Ruta',
            'retiros': 'Retiros',
            'piezasTotal': 'Piezas Total',
            'bultosTotal': 'Bultos Total',
            'palets': 'Palets',
            'peso': 'Peso',
            'zona': 'Zona',
            'piezasEntregadas': 'Piezas Entregadas',
            'piezasNoEntregadas': 'Piezas No Entregadas',
            'visitadasNovedad': 'Visitadas Novedad',
            'noVisitadas': 'No Visitadas',
            'bultosEntregados': 'Bultos Entregados',
            'bultosDevueltos': 'Bultos Devueltos',
            'bultosNoEntregados': 'Bultos No Entregados',
            'costoTotal': 'Costo Total',
            'presupuesto': 'Presupuesto',
            'observaciones': 'Observaciones',
            'ruta': 'Ruta',
            'cliente': 'Cliente'
        }
        suc_df.rename(columns={k: v for k, v in rename_dict.items() if k in suc_df.columns}, inplace=True)
        
        # Clean sheet name (max 31 chars, no special chars)
        sheet_name = str(suc)[:31]
        suc_df.to_excel(writer, sheet_name=sheet_name, index=False)
        
        ws = writer.sheets[sheet_name]
        add_excel_table(ws, suc_df, f"Tabla_{sheet_name.replace(' ', '_')}")
        
        # Add history for this sucursal in a separate sheet
        if historial_data:
            suc_hist_data = [h for h in historial_data if h.get('sucursal') == suc]
            if suc_hist_data:
                hist_sheet_name = f"Hist_{sheet_name}"[:31]
                add_historial_sheet_for_consolidated(writer, suc_hist_data, hist_sheet_name)

    writer.close()
    output.seek(0)
    
    date_str = datetime.now().strftime("%d-%m-%y")
    headers = {
        'Content-Disposition': f'attachment; filename="Consolidado_{date_str}.xlsx"'
    }
    return Response(content=output.read(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
