; kung_06: параметры и код задания дополнительного уровня 1999 г. (#79C0..#7E0F, 1104 байта; продолжение блока - герои, карта, экран)
; собирается sjasmplus (task.bin - из task.txt, см. tools/levels.py); подробности - docs/FORMATS.md

HUMAN	EQU	#B800
LEVDAT	EQU	#79C0
	ORG	LEVDAT

isRUNL	DEFB	#C9	; #C9 - обычный уровень
hTOWER	DEFB	1	; макс. число типов вооружения (1-4)
hARC	DEFB	0
hHORSE	DEFB	2
hSHILD	DEFB	0
hBLADE	DEFB	0
hmaxC	DEFB	0	; число исследуемых заклинаний священника
hmaxW	DEFB	0	; то же волшебника
hmaxB1	DEFB	0	; макс. число стандартных зданий
hmaxB2	DEFB	0	; макс. число доп. зданий
hWALL	DEFB	0	; 0/17 - можно/нельзя строить стены
kTOWER	DEFB	1	; параметры компьютера
kARC	DEFB	0
kHORSE	DEFB	2
kSHILD	DEFB	0
kBLADE	DEFB	0
kmaxC	DEFB	1
kmaxW	DEFB	0
levMAX	DEFB	1	; макс. народу в группе врага
levDEL	DEFB	#89	; средняя задержка между сборами врага
lev1ST	DEFB	#9B	; начальная задержка первого сбора
levTYP	DEFB	1	; тип уровня (0 - обычный)
COLOR	DEFB	#18	; цвет поля
MASTER	DEFB	1	; кто играет: 0 люди, 1 кунги
LEVEL	DEFB	6	; номер уровня
MONEY	DEFB	0,0,0,0,0,0	; деньги (6 цифр)
WOOD	DEFB	0,0,0,0,0,0	; лес (6 цифр)
TASK_M	INCBIN	"task.bin"	; задание: 3 строки (см. task.txt)
LEVRES	DEFB	0,0,0,#2B,0,0,#7F	; текущее время прохождения
fsLAND	DEFB	2	; ландшафт 1-4
fsMUS	DEFB	1	; мелодия 0-7
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
onPAUS	DEFB	6
NOTA	DEFW	#7A4C
se	DEFW	#FFFF
levSND	DEFB	0
sIY56	DEFW	#0000
priv_S	DEFB	0
NOTA2	DEFW	#7A4C
priv_2	DEFB	0
pntX	DEFB	#3B
pntY	DEFB	4
pntNUM	DEFB	#FF
pntDEL	DEFB	#93
pntTAR	DEFB	3
pntUNI	DEFB	0
pntEN	DEFB	0,2,1,0,0,0
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
        ld ix,HUMAN                   ; 7A6E  dd2100b8
        ld b,$30                      ; 7A72  0630
L_7A74:
        ld a,(ix+$04)                 ; 7A74  dd7e04
        cp $17                        ; 7A77  fe17
        jr z,L_7A89                   ; 7A79  280e
L_7A7B:
        ld de,$0010                   ; 7A7B  111000
        add ix,de                     ; 7A7E  dd19
        djnz L_7A74                   ; 7A80  10f2
        ld a,(END_1)                  ; 7A82  3a627a
L_7A85:
        ld (TheEND),a                 ; 7A85  32647a
        ret                           ; 7A88  c9

L_7A89:
        ld l,(ix+$00)                 ; 7A89  dd6e00
        ld h,(ix+$01)                 ; 7A8C  dd6601
        ld de,$0402                   ; 7A8F  110204
        sbc hl,de                     ; 7A92  ed52
        jr nz,L_7A7B                  ; 7A94  20e5
        ld a,$01                      ; 7A96  3e01
        jr L_7A85                     ; 7A98  18eb

	DEFS	#7AA0-$,#27	; заполнитель до BULL (код задания - не более 53 байт: #7A6B..#7A9F)
	DEFS	#7E00-$	; рабочие массивы BULL, MINE, HBUILD, KBUILD, BUF512 (в файле нули)

datMIN	DEFW	65535,65535,65535,65535,65535,65535,65535,65535	; золото 8 шахт (/100)
datHER		; здесь начинаются герои (496 байт), карта (4096) и экран (6912) - в файлах heroes.txt, map.csv, screen.png
