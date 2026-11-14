; human_16: параметры и код задания дополнительного уровня 1999 г. (#79C0..#7E0F, 1104 байта; продолжение блока - герои, карта, экран)
; собирается sjasmplus (task.bin - из task.txt, см. tools/levels.py); подробности - docs/FORMATS.md

KBUILD	EQU	#7D00
LEVDAT	EQU	#79C0
	ORG	LEVDAT

isRUNL	DEFB	#C9	; #C9 - обычный уровень
hTOWER	DEFB	4	; макс. число типов вооружения (1-4)
hARC	DEFB	1
hHORSE	DEFB	2
hSHILD	DEFB	1
hBLADE	DEFB	1
hmaxC	DEFB	3	; число исследуемых заклинаний священника
hmaxW	DEFB	3	; то же волшебника
hmaxB1	DEFB	2	; макс. число стандартных зданий
hmaxB2	DEFB	4	; макс. число доп. зданий
hWALL	DEFB	#11	; 0/17 - можно/нельзя строить стены
kTOWER	DEFB	4	; параметры компьютера
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
COLOR	DEFB	#20	; цвет поля
MASTER	DEFB	0	; кто играет: 0 люди, 1 кунги
LEVEL	DEFB	#10	; номер уровня
MONEY	DEFB	0,0,2,0,0,0	; деньги (6 цифр)
WOOD	DEFB	0,0,1,0,0,0	; лес (6 цифр)
TASK_M	INCBIN	"task.bin"	; задание: 3 строки (см. task.txt)
LEVRES	DEFB	0,0,0,#2B,0,9,#7F	; текущее время прохождения
fsLAND	DEFB	2	; ландшафт 1-4
fsMUS	DEFB	7	; мелодия 0-7
SEL_T	DEFB	0
SEL_N	DEFB	0,0,0,0,0,0
sel_en	DEFB	#A8
sel_ti	DEFB	0
LED	DEFB	0,0,0,0,0,0
_msg	DEFB	5
pTX_AD	DEFW	#F1A9
TX_AD	DEFW	#F1A9
pTXdel	DEFB	0
isPLAT	DEFB	0
szPLAT	DEFB	3
bcPLAT	DEFW	#0606
adPLAT	DEFW	#D8C6
waPLAT	DEFB	0
onPAUS	DEFB	#10
NOTA	DEFW	#FFED
se	DEFW	#FFFF
levSND	DEFB	0
sIY56	DEFW	#2121
priv_S	DEFB	0
NOTA2	DEFW	#FF69
priv_2	DEFB	#14
pntX	DEFB	#20
pntY	DEFB	#1F
pntNUM	DEFB	6
pntDEL	DEFB	0
pntTAR	DEFB	0
pntUNI	DEFB	0
pntEN	DEFB	4,4,3,3,4,4
pntMAN	DEFB	#0D
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
        push ix                       ; 7A6E  dde5
        ld ix,KBUILD                  ; 7A70  dd21007d
        ld de,$0008                   ; 7A74  110800
        ld b,$20                      ; 7A77  0620
L_7A79:
        ld a,(ix+$02)                 ; 7A79  dd7e02
        cp $11                        ; 7A7C  fe11
        jr nz,L_7A88                  ; 7A7E  2008
        ld a,(ix+$00)                 ; 7A80  dd7e00
        or a                          ; 7A83  b7
        ld a,$01                      ; 7A84  3e01
        jr z,L_7A8F                   ; 7A86  2807
L_7A88:
        add ix,de                     ; 7A88  dd19
        djnz L_7A79                   ; 7A8A  10ed
        ld a,(END_1)                  ; 7A8C  3a627a
L_7A8F:
        ld (TheEND),a                 ; 7A8F  32647a
        pop ix                        ; 7A92  dde1
        ret                           ; 7A94  c9

	DEFS	#7AA0-$,#27	; заполнитель до BULL (код задания - не более 53 байт: #7A6B..#7A9F)
	DEFS	#7E00-$	; рабочие массивы BULL, MINE, HBUILD, KBUILD, BUF512 (в файле нули)

datMIN	DEFW	5000,50,656,65535,65535,65535,65535,65535	; золото 8 шахт (/100)
datHER		; здесь начинаются герои (496 байт), карта (4096) и экран (6912) - в файлах heroes.txt, map.csv, screen.png
