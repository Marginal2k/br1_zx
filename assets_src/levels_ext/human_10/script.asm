; human_10: параметры и код задания дополнительного уровня 1999 г. (#79C0..#7E0F, 1104 байта; продолжение блока - герои, карта, экран)
; собирается sjasmplus (task.bin - из task.txt, см. tools/levels.py); подробности - docs/FORMATS.md

HUMAN	EQU	#B800
LEVDAT	EQU	#79C0
	ORG	LEVDAT

isRUNL	DEFB	#C9	; #C9 - обычный уровень
hTOWER	DEFB	1	; макс. число типов вооружения (1-4)
hARC	DEFB	1
hHORSE	DEFB	0
hSHILD	DEFB	1
hBLADE	DEFB	1
hmaxC	DEFB	0	; число исследуемых заклинаний священника
hmaxW	DEFB	0	; то же волшебника
hmaxB1	DEFB	0	; макс. число стандартных зданий
hmaxB2	DEFB	0	; макс. число доп. зданий
hWALL	DEFB	0	; 0/17 - можно/нельзя строить стены
kTOWER	DEFB	1	; параметры компьютера
kARC	DEFB	1
kHORSE	DEFB	0
kSHILD	DEFB	0
kBLADE	DEFB	0
kmaxC	DEFB	1
kmaxW	DEFB	0
levMAX	DEFB	3	; макс. народу в группе врага
levDEL	DEFB	#89	; средняя задержка между сборами врага
lev1ST	DEFB	#9B	; начальная задержка первого сбора
levTYP	DEFB	1	; тип уровня (0 - обычный)
COLOR	DEFB	#10	; цвет поля
MASTER	DEFB	0	; кто играет: 0 люди, 1 кунги
LEVEL	DEFB	#0A	; номер уровня
MONEY	DEFB	0,0,0,0,0,0	; деньги (6 цифр)
WOOD	DEFB	0,0,0,0,0,0	; лес (6 цифр)
TASK_M	INCBIN	"task.bin"	; задание: 3 строки (см. task.txt)
LEVRES	DEFB	0,0,0,#2B,0,0,#7F	; текущее время прохождения
fsLAND	DEFB	3	; ландшафт 1-4
fsMUS	DEFB	3	; мелодия 0-7
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
onPAUS	DEFB	#0A
NOTA	DEFW	#7A4C
se	DEFW	#FFFF
levSND	DEFB	0
sIY56	DEFW	#0000
priv_S	DEFB	0
NOTA2	DEFW	#7A4C
priv_2	DEFB	0
pntX	DEFB	#2B
pntY	DEFB	6
pntNUM	DEFB	#FF
pntDEL	DEFB	#97
pntTAR	DEFB	8
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
        push ix                       ; 7A6E  dde5
        ld ix,HUMAN                   ; 7A70  dd2100b8
        ld b,$30                      ; 7A74  0630
L_7A76:
        ld a,(ix+$04)                 ; 7A76  dd7e04
        cp $16                        ; 7A79  fe16
        jr z,L_7A8D                   ; 7A7B  2810
L_7A7D:
        ld de,$0010                   ; 7A7D  111000
        add ix,de                     ; 7A80  dd19
        djnz L_7A76                   ; 7A82  10f2
        ld a,(END_1)                  ; 7A84  3a627a
L_7A87:
        ld (TheEND),a                 ; 7A87  32647a
        pop ix                        ; 7A8A  dde1
        ret                           ; 7A8C  c9

L_7A8D:
        ld l,(ix+$00)                 ; 7A8D  dd6e00
        ld h,(ix+$01)                 ; 7A90  dd6601
        ld de,$1a3c                   ; 7A93  113c1a
        sbc hl,de                     ; 7A96  ed52
        jr nz,L_7A7D                  ; 7A98  20e3
        ld a,$01                      ; 7A9A  3e01
        jr L_7A87                     ; 7A9C  18e9

	DEFS	#7AA0-$,#27	; заполнитель до BULL (код задания - не более 53 байт: #7A6B..#7A9F)
	DEFS	#7E00-$	; рабочие массивы BULL, MINE, HBUILD, KBUILD, BUF512 (в файле нули)

datMIN	DEFW	65535,65535,65535,65535,65535,65535,65535,65535	; золото 8 шахт (/100)
datHER		; здесь начинаются герои (496 байт), карта (4096) и экран (6912) - в файлах heroes.txt, map.csv, screen.png
