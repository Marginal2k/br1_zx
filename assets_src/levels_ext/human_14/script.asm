; human_14: параметры и код задания дополнительного уровня 1999 г. (#79C0..#7E0F, 1104 байта; продолжение блока - герои, карта, экран)
; собирается sjasmplus (task.bin - из task.txt, см. tools/levels.py); подробности - docs/FORMATS.md

LEVDAT	EQU	#79C0
	ORG	LEVDAT

isRUNL	DEFB	#C9	; #C9 - обычный уровень
hTOWER	DEFB	1	; макс. число типов вооружения (1-4)
hARC	DEFB	1
hHORSE	DEFB	2
hSHILD	DEFB	1
hBLADE	DEFB	1
hmaxC	DEFB	0	; число исследуемых заклинаний священника
hmaxW	DEFB	0	; то же волшебника
hmaxB1	DEFB	0	; макс. число стандартных зданий
hmaxB2	DEFB	0	; макс. число доп. зданий
hWALL	DEFB	#11	; 0/17 - можно/нельзя строить стены
kTOWER	DEFB	3	; параметры компьютера
kARC	DEFB	1
kHORSE	DEFB	2
kSHILD	DEFB	1
kBLADE	DEFB	1
kmaxC	DEFB	3
kmaxW	DEFB	3
levMAX	DEFB	#0B	; макс. народу в группе врага
levDEL	DEFB	#25	; средняя задержка между сборами врага
lev1ST	DEFB	#79	; начальная задержка первого сбора
levTYP	DEFB	0	; тип уровня (0 - обычный)
COLOR	DEFB	#31	; цвет поля
MASTER	DEFB	0	; кто играет: 0 люди, 1 кунги
LEVEL	DEFB	#0E	; номер уровня
MONEY	DEFB	0,0,0,4,5,0	; деньги (6 цифр)
WOOD	DEFB	0,0,0,3,5,0	; лес (6 цифр)
TASK_M	INCBIN	"task.bin"	; задание: 3 строки (см. task.txt)
LEVRES	DEFB	0,0,0,#2B,0,3,#7F	; текущее время прохождения
fsLAND	DEFB	2	; ландшафт 1-4
fsMUS	DEFB	6	; мелодия 0-7
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
szPLAT	DEFB	3
bcPLAT	DEFW	#0606
adPLAT	DEFW	#D8C6
waPLAT	DEFB	0
onPAUS	DEFB	#0E
NOTA	DEFW	#7A4C
se	DEFW	#FFFF
levSND	DEFB	0
sIY56	DEFW	#0000
priv_S	DEFB	0
NOTA2	DEFW	#FF1D
priv_2	DEFB	5
pntX	DEFB	#32
pntY	DEFB	2
pntNUM	DEFB	#FF
pntDEL	DEFB	#2B
pntTAR	DEFB	#88
pntUNI	DEFB	0
pntEN	DEFB	4,4,0,3,0,4
pntMAN	DEFB	0
END_1	DEFB	0	; 0/1/2 - нет/нет врагов/нет людей
END_2	DEFB	0
TheEND	DEFB	0	; 0/1/2 - нет/победа людей/победа врагов (ставит _cLOOP)
dummy	DEFB	#80,0,0,0,0,0	; резерв

;------------ процедуры: pcLOOP - каждый кадр, pcINI - при старте ------------
pcLOOP:

        jr _cLOOP                     ; 7A6B  1801

pcINI:
        ret                           ; 7A6D  c9

_cLOOP:
        ld a,(END_1)                  ; 7A6E  3a627a
        ld (TheEND),a                 ; 7A71  32647a
        or a                          ; 7A74  b7
        ld de,$7a9a                   ; 7A75  119a7a
        jr z,L_7A7D                   ; 7A78  2803
        ld de,$7a97                   ; 7A7A  11977a
L_7A7D:
        ld hl,($4046)                 ; 7A7D  2a4640
        ld bc,$0004                   ; 7A80  010400
        add hl,bc                     ; 7A83  09
        ld a,(de)                     ; 7A84  1a
        ld (hl),a                     ; 7A85  77
        inc de                        ; 7A86  13
        ld hl,($4048)                 ; 7A87  2a4840
        ld c,$0f                      ; 7A8A  0e0f
        add hl,bc                     ; 7A8C  09
        ld a,(de)                     ; 7A8D  1a
        ld (hl),a                     ; 7A8E  77
        inc de                        ; 7A8F  13
        ld hl,($404a)                 ; 7A90  2a4a40
        add hl,bc                     ; 7A93  09
        ld a,(de)                     ; 7A94  1a
        ld (hl),a                     ; 7A95  77
        ret                           ; 7A96  c9

	DEFB	#02,#43,#0F,#C8,#4A,#17,#27,#27,#27
	DEFS	864

datMIN	DEFW	5000,65535,65535,65535,65535,65535,65535,65535	; золото 8 шахт (/100)
datHER		; здесь начинаются герои (496 байт), карта (4096) и экран (6912) - в файлах heroes.txt, map.csv, screen.png
