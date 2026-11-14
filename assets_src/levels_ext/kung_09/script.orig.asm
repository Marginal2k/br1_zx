; kung_09 (как в LW, с защитой TST): параметры и код задания дополнительного уровня 1999 г. (#79C0..#7E0F, 1104 байта; продолжение блока - герои, карта, экран)
; собирается sjasmplus (task.bin - из task.txt, см. tools/levels.py); подробности - docs/FORMATS.md

LEVDAT	EQU	#79C0
	ORG	LEVDAT

isRUNL	DEFB	#C9	; #C9 - обычный уровень
hTOWER	DEFB	4	; макс. число типов вооружения (1-4)
hARC	DEFB	0
hHORSE	DEFB	0
hSHILD	DEFB	0
hBLADE	DEFB	0
hmaxC	DEFB	2	; число исследуемых заклинаний священника
hmaxW	DEFB	1	; то же волшебника
hmaxB1	DEFB	2	; макс. число стандартных зданий
hmaxB2	DEFB	3	; макс. число доп. зданий
hWALL	DEFB	#11	; 0/17 - можно/нельзя строить стены
kTOWER	DEFB	4	; параметры компьютера
kARC	DEFB	0
kHORSE	DEFB	1
kSHILD	DEFB	0
kBLADE	DEFB	0
kmaxC	DEFB	1
kmaxW	DEFB	1
levMAX	DEFB	5	; макс. народу в группе врага
levDEL	DEFB	#43	; средняя задержка между сборами врага
lev1ST	DEFB	#7D	; начальная задержка первого сбора
levTYP	DEFB	0	; тип уровня (0 - обычный)
COLOR	DEFB	#38	; цвет поля
MASTER	DEFB	1	; кто играет: 0 люди, 1 кунги
LEVEL	DEFB	9	; номер уровня
MONEY	DEFB	0,0,1,5,0,0	; деньги (6 цифр)
WOOD	DEFB	0,0,0,5,0,0	; лес (6 цифр)
TASK_M	INCBIN	"task.bin"	; задание: 3 строки (см. task.txt)
LEVRES	DEFB	0,0,0,#2B,0,0,#7F	; текущее время прохождения
fsLAND	DEFB	4	; ландшафт 1-4
fsMUS	DEFB	5	; мелодия 0-7
SEL_T	DEFB	0
SEL_N	DEFB	0,0,0,0,0,0
sel_en	DEFB	#FF
sel_ti	DEFB	0
LED	DEFB	0,0,0,0,0,0
_msg	DEFB	0
pTX_AD	DEFW	#F0D7
TX_AD	DEFW	#F0D7
pTXdel	DEFB	0
isPLAT	DEFB	0
szPLAT	DEFB	0
bcPLAT	DEFW	#0000
adPLAT	DEFW	#0000
waPLAT	DEFB	0
onPAUS	DEFB	9
NOTA	DEFW	#7A4C
se	DEFW	#FFFF
levSND	DEFB	0
sIY56	DEFW	#0000
priv_S	DEFB	0
NOTA2	DEFW	#FF1D
priv_2	DEFB	5
pntX	DEFB	#1D
pntY	DEFB	2
pntNUM	DEFB	#FF
pntDEL	DEFB	#74
pntTAR	DEFB	#92
pntUNI	DEFB	0
pntEN	DEFB	4,4,1,1,4,4
pntMAN	DEFB	0
END_1	DEFB	0	; 0/1/2 - нет/нет врагов/нет людей
END_2	DEFB	0
TheEND	DEFB	0	; 0/1/2 - нет/победа людей/победа врагов (ставит _cLOOP)
dummy	DEFB	0,0,0,0,0,0	; резерв

;------------ процедуры: pcLOOP - каждый кадр, pcINI - при старте ------------
pcLOOP:

        jr _cLOOP                     ; 7A6B  181f

pcINI:
        xor a                         ; 7A6D  af
        ld hl,$4050                   ; 7A6E  215040
        ld bc,$3600                   ; 7A71  010036
L_7A74:
        add a,(hl)                    ; 7A74  86
        rrca                          ; 7A75  0f
        inc hl                        ; 7A76  23
        dec c                         ; 7A77  0d
        jr nz,L_7A74                  ; 7A78  20fa
        djnz L_7A74                   ; 7A7A  10f8
        ld hl,$4043                   ; 7A7C  214340
        ld de,pcINI                   ; 7A7F  116d7a
        cp (hl)                       ; 7A82  be
        jr nz,L_7A87                  ; 7A83  2002
        xor a                         ; 7A85  af
        ld (de),a                     ; 7A86  12
L_7A87:
        inc de                        ; 7A87  13
        ld c,$1c                      ; 7A88  0e1c
        ldir                          ; 7A8A  edb0
_cLOOP:
        ld a,(END_1)                  ; 7A8C  3a627a
        ld (TheEND),a                 ; 7A8F  32647a
        ld hl,pcINI                   ; 7A92  216d7a
        ld a,(hl)                     ; 7A95  7e
        or a                          ; 7A96  b7
        ret z                         ; 7A97  c8
        dec (hl)                      ; 7A98  35
        ret nz                        ; 7A99  c0
        rst $38                       ; 7A9A  ff
        ret                           ; 7A9B  c9

	DEFS	#7AA0-$,#27	; заполнитель до BULL (код задания - не более 53 байт: #7A6B..#7A9F)
	DEFS	#7E00-$	; рабочие массивы BULL, MINE, HBUILD, KBUILD, BUF512 (в файле нули)

datMIN	DEFW	170,209,240,259,65535,65535,65535,65535	; золото 8 шахт (/100)
datHER		; здесь начинаются герои (496 байт), карта (4096) и экран (6912) - в файлах heroes.txt, map.csv, screen.png
