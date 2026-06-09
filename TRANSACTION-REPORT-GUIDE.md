# Fleet Transaction Report Preparation Guide

How to format a fleet fueling CSV so the Fleet Insights analysis engine can read it correctly.

---

## File Format

| Requirement | Detail |
|---|---|
| **File type** | `.csv` (comma-separated values) |
| **Encoding** | UTF-8 (UTF-8 BOM is fine — it is stripped automatically) |
| **Header row** | Must be the first non-blank line |
| **Delimiter** | Comma |
| **Quoted values** | Supported — fields may be wrapped in double quotes |
| **Empty rows** | Ignored automatically |
| **Rows with 0 gallons** | Skipped — used to filter out summary/subtotal rows |

Export directly from your fleet card portal as CSV. Do not open and re-save in Excel first if possible — Excel sometimes changes date formats or adds a signature row.

---

## Required Fields

Three fields are required. Without them, the analysis cannot run.

| Canonical name | What it needs to contain | Example |
|---|---|---|
| **Date** | Transaction date (any standard format — see below) | `01/15/2025` |
| **City** | City where fueling occurred | `Columbus` |
| **Gallons** | Fuel volume purchased (positive number) | `87.3` |

State is optional — it can be inferred via geocoding when the city and ZIP code are present.

---

## Column Header Aliases

The engine matches your CSV column headers against a built-in alias list. **Header matching is case-insensitive** and ignores punctuation (hyphens, slashes, extra spaces). You do not need to rename your headers — as long as your header text is in one of the lists below, it will be recognized automatically.

### Date

```
Trans DateTime, Transaction DateTime
Trans Date, Date, Transaction Date, Posting Date, Post Date
Tran Date, Service Date, Fill Date, Invoice Date, Sale Date
TransactionPosDate, POS Date, TransDate
```

> **Tip:** If your export has a combined date+time column (e.g. `Trans DateTime`), use it — it is preferred over a date-only column and also captures the time.

### Time *(optional separate column)*

```
Transaction Time, Trans Time, Tran Time
Service Time, Fill Time, Time
```

Only needed when your date column contains a date only (no time component). Ignored when the date field already includes a timestamp.

### City

```
Station City, City, Site City, Location City, Trans City
Merchant City, Fuel City, Fueling City, Store City
Truck Stop City, LocationCity, TransCity, SiteCity
```

### State

```
Station State, State, Site State, Location State
Merchant State, Fuel State, Fueling State, ST, Store State
Prov, Province, LocationState, TransState
Merchant State / Province, Trans State, Transaction State
Service State, Fill State, Loc State, Mcht State, Merch State
Truck Stop State, SiteState, StationState
```

### Gallons / Fuel Volume

```
Gallons, Quantity, Gal, Volume, Fuel Quantity, Qty
Fuel Gallons, Net Gallons, Amount Gallons, Total Gallons, Fuel Volume
Unit/Gallons, Units/Gallons, Unit Gallons, Units Gallons
Units, Net Qty, Net Quantity, Billed Quantity, Billed Qty
#2 Diesel Gallons, Diesel Gallons, Gasoline Gallons, Gas Gallons
Unleaded Gallons, DEF Gallons
Number of Tractor Gallons, Tractor Gallons
Qty Purchased, QtyPurchased, Quantity Purchased
```

> **Fuel type inference:** When your export has a product-specific gallons column (e.g. `Diesel Gallons` or `Number of Tractor Gallons`) but no separate fuel type column, the engine infers the fuel type automatically from the column name.

### Fuel Type

```
EPA Fuel Type Purchased, EPA Fuel Type, Fuel Type, Product Type
Fuel Category, Fuel Class, Energy Type, Product Code
ProductDesc, Product Desc, ProductDescription, Product Description
NACS
Type
```

> **Priority order:** A descriptive column (`Product Description`, `Fuel Type`) is preferred over a NACS numeric code column. If multiple fuel-type columns exist, the first recognized match wins.

### Station / Merchant Name

```
Station Name, Site Name, Location Name, Merchant Name
Store Name, Location Description
Truck Stop Name, Service Center
StationName, SiteName, Merchant
```

### Station Brand / Network

```
Station Brand Name, Brand, Network, Station Brand
Merchant Brand, Fuel Brand, Chain, Oil Company, Brand Name
StationBrand, StationBrandName
```

> **Brand inference:** When no brand column is present, the engine attempts to infer the brand from the station name (e.g. `CIRCLE K #12345` → Circle K, `CHEVRON 0207755` → Chevron).

### Street Address

```
Station Address, Address, Street, Street Address
Site Address, Location Address, Addr, Address 1
Merchant Address, Merchant Street
Service Center Address
SiteAddress, StationAddress
```

### ZIP / Postal Code

```
ZipCode, Zip, Zip Code, Postal Code, Zip_Code
PostalCode, Postal, Zip/Postal
Merchant Postal Code, Merchant Zip, Merchant ZipCode
Service Center Zip Code
```

### Unit / Vehicle Number

```
Unit #, Unit Number, Vehicle, Card #, Card Number
Vehicle ID, Asset, Unit, Vehicle #, Asset ID, Asset Number
Equipment, Truck #, Truck Number, Unit ID
```

### Amount / Spend

```
Amount, Total, Total Amount, Spend, Cost, Sale Amount
Net Amount, Transaction Amount, Charge, Total Cost, Total Charge
Invoice Amount, Billed Amount, Dollars
Net Cost, Total Fuel Cost, Gross Amount, Gross Cost
Total Amount Due, Cost of Tractor Fuel
```

### Price Per Gallon *(used to calculate amount when no total column exists)*

```
PPU, PPU/Amount, Price Per Unit, Price Per Gallon
Unit Price, Unit Cost, PPG, PPU/Gal, Cost Per Gallon, Price/Gal
Cost/Gal, Retail Price
Tractor Fuel Price Per Gallon
```

### Driver / Cardholder Name

```
Driver Name, Driver Full Name, Cardholder Name, Cardholder
Employee Name, Employee, Operator Name, Operator
Authorized Name, Driver Authorized Name
```

Or split into two columns:

```
Driver First Name, Driver First, First Name, Cardholder First Name
Employee First Name, Driver FName, First

Driver Last Name, Driver Last, Last Name, Cardholder Last Name
Employee Last Name, Driver LName, Last
```

When both first and last columns are present but no full-name column exists, the engine concatenates them automatically.

### Driver Home City *(optional)*

```
Driver City, Home City, Driver Home City, Driver Location
Driver Base City, Base City
```

---

## Recognized Fuel Type Codes

The engine maps raw fuel type values to three canonical types: **DIESEL**, **GASOLINE**, and **DEF**. Unrecognized values are preserved as-is and appear in the Transaction Breakdown tab.

### Diesel

| Pattern | Examples |
|---|---|
| Contains `DIESEL` | Diesel, Ultra Low Sulfur Diesel, Dyed Diesel |
| `ULSD` | ULSD |
| `D2`, `#2`, `D-2` | D2, #2 |
| `DSL`, `DSEL` | DSL |
| `HSD`, `LSD`, `LS` | High-Speed Diesel, Low Sulphur |
| Contains `REEFER` | Reefer Fuel |
| Contains `OFF ROAD` or `OFF-ROAD` | Off-Road Diesel |
| Contains `DYED` or `DYE` | Dyed Diesel |
| Contains `BIODIESEL`, starts with `B20`/`B5`/`B10` | Biodiesel blends |
| `CLEAR DIESEL`, `HEATING OIL` | |
| `NO2`, `NO. 2`, `NUMBER 2` | |
| NACS codes 017–025, 057 | 019, 020, 021 (ULSD / Premium / Reefer) |

### Gasoline

| Pattern | Examples |
|---|---|
| Contains `UNL` or `UNLEAD` | Unleaded, UNLEAD, UNL |
| Comdata UN* codes | `UNRG` (Regular), `UNPR` (Premium), `UNMD` / `UNMID` (Mid-grade) |
| `REG`, `REGULAR`, `GASOLINE`, `GAS` | |
| Contains `PREMIUM` | Premium, Super Premium |
| Contains `MIDGRADE` or `MID-GRADE` | |
| `PRM`, `PRML`, `MID`, `SUPER`, `PLUS` | |
| Starts with `E85`, `ETHANOL`, contains `FLEX FUEL` | E85 |
| Octane grades: `87`, `89`, `91`, `93` | 87, 89 OCT |
| `REGULAR UNLEADED`, `PREMIUM UNLEADED` | |
| CNG / LNG / Propane | (reported as Gasoline) |
| NACS codes 001–005, 058–060, 006–008 | 001 (Regular), 002 (Mid), 003 (Premium) |

### DEF (Diesel Exhaust Fluid)

| Pattern | Examples |
|---|---|
| `DEF` | |
| Contains `EXHAUST FLUID` | DEF / Exhaust Fluid |
| `ADBLUE`, `UREA` | |
| Contains `SCR FLUID` | |
| NACS codes 054, 065 | |

### NACS Numeric Codes

If your export uses NACS product-category codes as the fuel type value, the engine reads them directly:

| Code(s) | Fuel type |
|---|---|
| 001, 002, 003, 004, 005 | Gasoline (Regular / Mid / Premium / Super) |
| 058, 059, 060 | Gasoline (Mid / Premium variants) |
| 006, 007, 008 | Gasoline (CNG / LNG / Propane) |
| 017, 018, 019, 020, 021 | Diesel |
| 022, 023, 024, 025 | Diesel (Off-Road / Dyed / Biodiesel) |
| 057 | Diesel (Reefer) |
| 054, 065 | DEF |

Codes may appear as bare numbers (`019`) or with a description suffix (`019-DIESEL #2`, `019 Diesel`) — both are handled.

---

## Supported Report Formats

The engine detects your report format automatically from header fingerprints. No configuration needed.

| Detected format | Signature header(s) |
|---|---|
| **WEX** | `Station Brand Name` |
| **WEX / Fleet One** | `Posting Date` or `Post Date` |
| **Fuelman / Fleetcor** | `Invoice Date` |
| **RCPA** | `Unit/Gallons` or `Units/Gallons` |
| **OTR Fuel Card / Comdata** | `Truck Stop Name` or `Truck Stop City` |
| **WEX Site-Level** | `QtyPurchased` or (`NACS` + `SiteCity`) |
| **Generic Fleet** | *(fallback — any CSV with the three required fields)* |

### Comdata-specific columns

Comdata exports use non-standard names that map as follows:

| Comdata column | Mapped to |
|---|---|
| Truck Stop Name | Station Name |
| Truck Stop City | City |
| Truck Stop State | State |
| Service Center Zip Code | ZIP Code |
| Service Center Address | Street Address |
| Number of Tractor Gallons | Gallons *(implies DIESEL fuel type)* |
| Tractor Fuel Price Per Gallon | Price per gallon |
| Total Amount Due | Amount |
| Cost of Tractor Fuel | Amount |
| Unit Number | Unit/Vehicle number |

---

## Date & Time Formats

The engine accepts all common date formats:

| Format | Example |
|---|---|
| MM/DD/YYYY | `01/15/2025` |
| YYYY-MM-DD | `2025-01-15` |
| M/D/YY | `1/5/25` |
| ISO 8601 with time | `2025-01-15T14:32:00` |
| Space-separated with AM/PM | `01/15/2025 04:44:00 PM` |
| Space-separated 24-hour | `01/15/2025 16:44:00` |

Time of day is captured when present (used for the Time Patterns analysis). If your export has a separate time column, name it `Transaction Time`, `Trans Time`, or `Time`.

---

## What Happens with Unrecognized Values

| Data | Behavior |
|---|---|
| Unrecognized fuel type string | Preserved as-is; appears in Transaction Breakdown |
| Missing brand column | Engine infers brand from station name |
| Missing state column | State inferred from city + ZIP via geocoding |
| Missing amount column | Derived from price-per-gallon × gallons (if PPU column present) |
| Rows with 0 or negative gallons | Skipped (treats as summary/subtotal rows) |
| Mobile fueling vendors (Diesel Direct, Booster, Yoshi, etc.) | Flagged — proximity analysis is skipped since there is no physical pump location |

---

## Best Practices

1. **Use the fullest export available.** The more columns you include (brand, address, ZIP, driver, fuel type), the richer the analysis. The engine ignores columns it does not recognize.

2. **Include a fuel type column.** Without one, the engine falls back to gallons-column-name inference or leaves the type as Unknown. Fuel type drives the diesel/gasoline split and OTR analysis.

3. **Include ZIP codes.** ZIP codes improve Circle K proximity matching when addresses are incomplete or city names are ambiguous.

4. **One row per transaction.** Remove any summary rows before uploading, or leave them — rows with 0 gallons are skipped automatically.

5. **Date range.** The engine handles any date range. Longer date windows (3–12 months) produce more representative annual projections.

6. **Do not pre-aggregate by vehicle or location.** The engine expects individual transaction rows to identify per-vehicle patterns, time-of-day trends, and fraud signals.

7. **UTF-8 encoding.** Most fleet card portals export UTF-8 by default. Avoid exporting as Latin-1/Windows-1252 if your station names contain accented characters.

8. **Do not filter out Circle K transactions.** The analysis compares where your fleet currently fuels at Circle K vs. competitors — both are needed to calculate capture rate.
