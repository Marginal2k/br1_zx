; kung_08: параметры и код задания дополнительного уровня 1999 г. (#79C0..#7E0F, 1104 байта; продолжение блока - герои, карта, экран)
; собирается sjasmplus (task.bin - из task.txt, см. tools/levels.py); подробности - docs/FORMATS.md

LEVDAT	EQU	#79C0
	ORG	LEVDAT

isRUNL	DEFB	#C9	; #C9 - обычный уровень
hTOWER	DEFB	3	; макс. число типов вооружения (1-4)
hARC	DEFB	1
hHORSE	DEFB	0
hSHILD	DEFB	1
hBLADE	DEFB	1
hmaxC	DEFB	2	; число исследуемых заклинаний священника
hmaxW	DEFB	1	; то же волшебника
hmaxB1	DEFB	2	; макс. число стандартных зданий
hmaxB2	DEFB	3	; макс. число доп. зданий
hWALL	DEFB	#11	; 0/17 - можно/нельзя строить стены
kTOWER	DEFB	3	; параметры компьютера
kARC	DEFB	2
kHORSE	DEFB	2
kSHILD	DEFB	1
kBLADE	DEFB	2
kmaxC	DEFB	0
kmaxW	DEFB	1
levMAX	DEFB	2	; макс. народу в группе врага
levDEL	DEFB	#2B	; средняя задержка между сборами врага
lev1ST	DEFB	#7B	; начальная задержка первого сбора
levTYP	DEFB	0	; тип уровня (0 - обычный)
COLOR	DEFB	#30	; цвет поля
MASTER	DEFB	1	; кто играет: 0 люди, 1 кунги
LEVEL	DEFB	8	; номер уровня
MONEY	DEFB	0,0,0,5,0,0	; деньги (6 цифр)
WOOD	DEFB	0,0,0,0,0,0	; лес (6 цифр)
TASK_M	INCBIN	"task.bin"	; задание: 3 строки (см. task.txt)
LEVRES	DEFB	0,0,0,#2B,0,0,#7F	; текущее время прохождения
fsLAND	DEFB	1	; ландшафт 1-4
fsMUS	DEFB	7	; мелодия 0-7
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
onPAUS	DEFB	8
NOTA	DEFW	#7A4C
se	DEFW	#FFFF
levSND	DEFB	0
sIY56	DEFW	#0000
priv_S	DEFB	0
NOTA2	DEFW	#7A4C
priv_2	DEFB	0
pntX	DEFB	#1B
pntY	DEFB	#2C
pntNUM	DEFB	#FF
pntDEL	DEFB	#79
pntTAR	DEFB	#0A
pntUNI	DEFB	0
pntEN	DEFB	3,3,1,1,0,3
pntMAN	DEFB	0
END_1	DEFB	0	; 0/1/2 - нет/нет врагов/нет людей
END_2	DEFB	0
TheEND	DEFB	0	; 0/1/2 - нет/победа людей/победа врагов (ставит _cLOOP)
dummy	DEFB	0,0,0,0,0,0	; резерв

;------------ процедуры: pcLOOP - каждый кадр, pcINI - при старте ------------
pcLOOP:

        jr _cLOOP                     ; 7A6B  1801

pcINI:
        ret                           ; 7A6D  c9

_cLOOP:
        ld a,(END_1)                  ; 7A6E  3a627a
        ld (TheEND),a                 ; 7A71  32647a
        ret                           ; 7A74  c9

	DEFS	#7AA0-$,#27	; заполнитель до BULL (код задания - не более 53 байт: #7A6B..#7A9F)
	DEFS	#7E00-$	; рабочие массивы BULL, MINE, HBUILD, KBUILD, BUF512 (в файле нули)

datMIN	DEFW	500,210,1000,210,65535,65535,65535,65535	; золото 8 шахт (/100)
datHER		; здесь начинаются герои (496 байт), карта (4096) и экран (6912) - в файлах heroes.txt, map.csv, screen.png
